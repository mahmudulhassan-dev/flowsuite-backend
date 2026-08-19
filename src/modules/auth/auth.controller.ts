import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { hashPassword, comparePassword, generateToken } from '../../utils/auth';
import { sendMail, buildWelcomeEmail, buildPasswordResetEmail } from '../../lib/mailer';
import crypto from 'crypto';

export async function register(req: Request, res: Response): Promise<void> {
  try {
    const { email, password, fullName, organizationName } = req.body;
    if (!email || !password || !fullName || !organizationName) {
      res.status(400).json({ success: false, error: 'All fields are required' });
      return;
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(400).json({ success: false, error: 'User with this email already exists' });
      return;
    }

    const hashedPassword = await hashPassword(password);

    // Create Tenant atomically
    const result = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: organizationName,
          plan: 'PRO_AGENCY',
          aiCredits: 10000,
        },
      });

      const wallet = await tx.creditWallet.create({
        data: {
          organizationId: org.id,
          balance: 10000,
        },
      });

      const workspace = await tx.workspace.create({
        data: {
          organizationId: org.id,
          name: 'Default Workspace',
        },
      });

      await tx.workspaceSettings.create({
        data: {
          workspaceId: workspace.id,
          timezone: 'Asia/Dhaka',
          countryCode: 'BD',
          defaultLanguage: 'bn',
        },
      });

      const user = await tx.user.create({
        data: {
          email,
          password: hashedPassword,
          fullName,
          role: 'ADMIN',
          isSuperAdmin: false,
          organizationId: org.id,
        },
      });

      await tx.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: user.id,
          role: 'ADMIN',
        },
      });

      return { user, org, workspace };
    });

    const token = generateToken({
      userId: result.user.id,
      email: result.user.email,
      organizationId: result.org.id,
      workspaceId: result.workspace.id,
      isSuperAdmin: false,
    });

    // Fire-and-forget welcome email via Hostinger SMTP
    sendMail({
      to: result.user.email,
      subject: '🎉 Welcome to FlowSuite — Your account is ready!',
      html: buildWelcomeEmail(result.user.fullName, result.user.email),
    }).catch(err => console.error('Welcome email failed:', err));

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: {
        user: {
          id: result.user.id,
          email: result.user.email,
          fullName: result.user.fullName,
          role: result.user.role,
          organizationId: result.org.id,
          workspaceId: result.workspace.id,
        },
        token,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ success: false, error: 'Email and password are required' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(401).json({ success: false, error: 'Invalid email or password' });
      return;
    }

    const isValid = await comparePassword(password, user.password);
    if (!isValid) {
      res.status(401).json({ success: false, error: 'Invalid email or password' });
      return;
    }

    // Get user active workspace
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: user.id },
      include: { workspace: true },
    });

    let workspaceId = '';
    if (memberships.length > 0) {
      workspaceId = memberships[0].workspaceId;
    } else {
      // Fallback create default workspace if missing
      const workspace = await prisma.workspace.create({
        data: {
          organizationId: user.organizationId,
          name: 'Default Workspace',
        },
      });
      await prisma.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: user.id,
          role: 'ADMIN',
        },
      });
      workspaceId = workspace.id;
    }

    const token = generateToken({
      userId: user.id,
      email: user.email,
      organizationId: user.organizationId,
      workspaceId,
      isSuperAdmin: user.isSuperAdmin,
    });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          organizationId: user.organizationId,
          workspaceId,
        },
        token,
        workspaces: memberships.map(m => m.workspace),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function me(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        organizationId: true,
        isSuperAdmin: true,
      },
    });

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: user.id },
      include: { workspace: true },
    });

    res.json({
      success: true,
      data: {
        user,
        activeWorkspaceId: req.user.workspaceId,
        workspaces: memberships.map(m => m.workspace),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FORGOT PASSWORD — Send reset link via Hostinger SMTP
// ─────────────────────────────────────────────────────────────────────────────

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  try {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ success: false, error: 'Email is required' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email } });

    // Always respond with success to prevent email enumeration
    if (!user) {
      res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
      return;
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpiry = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: resetToken,
        passwordResetExpiry: resetExpiry,
      },
    });

    await sendMail({
      to: user.email,
      subject: '🔐 Reset your FlowSuite password',
      html: buildPasswordResetEmail(user.fullName, resetToken),
    });

    res.json({ success: true, message: 'Password reset link sent to your email.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RESET PASSWORD — Consume token and update password
// ─────────────────────────────────────────────────────────────────────────────

export async function resetPassword(req: Request, res: Response): Promise<void> {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      res.status(400).json({ success: false, error: 'Token and new password are required' });
      return;
    }

    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: token,
        passwordResetExpiry: { gte: new Date() },
      },
    });

    if (!user) {
      res.status(400).json({ success: false, error: 'Invalid or expired reset token' });
      return;
    }

    const hashed = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashed,
        passwordResetToken: null,
        passwordResetExpiry: null,
      },
    });

    res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OTP STORAGE & PHONE AUTH
// ─────────────────────────────────────────────────────────────────────────────

const otpStorage: Record<string, string> = {};

export async function sendOtp(req: Request, res: Response): Promise<void> {
  try {
    const { phone } = req.body;
    if (!phone) {
      res.status(400).json({ success: false, error: 'Phone number is required' });
      return;
    }

    // Generate random 6-digit OTP code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    otpStorage[phone] = code;

    console.log(`[OTP] Sent to ${phone}: ${code}`);

    res.json({
      success: true,
      message: `OTP code sent successfully (Use: ${code} or 123456 to test)`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function verifyOtp(req: Request, res: Response): Promise<void> {
  try {
    const { phone, code } = req.body;
    if (!phone || !code) {
      res.status(400).json({ success: false, error: 'Phone number and verification code are required' });
      return;
    }

    const savedCode = otpStorage[phone];
    if (code !== '123456' && code !== savedCode) {
      res.status(400).json({ success: false, error: 'Invalid or expired verification code' });
      return;
    }

    // Clear code
    delete otpStorage[phone];

    // Find user by phone number
    let user = await prisma.user.findFirst({
      where: { phone },
    });

    if (!user) {
      // Auto-register user by phone number
      const email = `${phone}@flowsuite.com`;
      const dummyPassword = await hashPassword(phone);

      const result = await prisma.$transaction(async (tx) => {
        const org = await tx.organization.create({
          data: {
            name: `${phone} Organization`,
            plan: 'PRO_AGENCY',
            aiCredits: 1000,
          },
        });

        await tx.creditWallet.create({
          data: {
            organizationId: org.id,
            balance: 1000,
          },
        });

        const workspace = await tx.workspace.create({
          data: {
            name: `${phone} Workspace`,
            organizationId: org.id,
          },
        });

        // Initialize default workspace settings
        await tx.workspaceSettings.create({
          data: {
            workspaceId: workspace.id,
            timezone: 'Asia/Dhaka',
            countryCode: 'BD',
            defaultLanguage: 'bn',
          },
        });

        const newUser = await tx.user.create({
          data: {
            email,
            password: dummyPassword,
            fullName: `${phone} User`,
            phone,
            role: 'ADMIN',
            organizationId: org.id,
          },
        });

        await tx.workspaceMember.create({
          data: {
            workspaceId: workspace.id,
            userId: newUser.id,
            role: 'ADMIN',
          },
        });

        return { user: newUser, workspace };
      });

      user = result.user;
    }

    // Find the user's workspaces
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: user.id },
      include: { workspace: true },
    });

    const workspaceId = memberships.length > 0 ? memberships[0].workspaceId : '';

    const token = generateToken({
      userId: user.id,
      email: user.email,
      organizationId: user.organizationId,
      workspaceId,
      isSuperAdmin: user.isSuperAdmin,
    });

    res.json({
      success: true,
      message: 'Login successful via OTP',
      data: {
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          organizationId: user.organizationId,
          workspaceId,
        },
        token,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SOCIAL LOGIN (GOOGLE / FACEBOOK / APPLE)
// ─────────────────────────────────────────────────────────────────────────────

export async function socialLogin(req: Request, res: Response): Promise<void> {
  try {
    const { email, fullName, platform, uid } = req.body;
    if (!email || !platform || !uid) {
      res.status(400).json({ success: false, error: 'Email, platform, and external UID are required' });
      return;
    }

    let user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Auto-register social login user
      const dummyPassword = await hashPassword(uid);

      const result = await prisma.$transaction(async (tx) => {
        const org = await tx.organization.create({
          data: {
            name: `${fullName || platform} Organization`,
            plan: 'PRO_AGENCY',
            aiCredits: 1000,
          },
        });

        await tx.creditWallet.create({
          data: {
            organizationId: org.id,
            balance: 1000,
          },
        });

        const workspace = await tx.workspace.create({
          data: {
            name: `${fullName || platform} Workspace`,
            organizationId: org.id,
          },
        });

        // Initialize default workspace settings
        await tx.workspaceSettings.create({
          data: {
            workspaceId: workspace.id,
            timezone: 'Asia/Dhaka',
            countryCode: 'BD',
            defaultLanguage: 'bn',
          },
        });

        const newUser = await tx.user.create({
          data: {
            email,
            password: dummyPassword,
            fullName: fullName || `${platform} User`,
            role: 'ADMIN',
            organizationId: org.id,
          },
        });

        await tx.workspaceMember.create({
          data: {
            workspaceId: workspace.id,
            userId: newUser.id,
            role: 'ADMIN',
          },
        });

        return { user: newUser, workspace };
      });

      user = result.user;
    }

    // Find the user's workspaces
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: user.id },
      include: { workspace: true },
    });

    const workspaceId = memberships.length > 0 ? memberships[0].workspaceId : '';

    const token = generateToken({
      userId: user.id,
      email: user.email,
      organizationId: user.organizationId,
      workspaceId,
      isSuperAdmin: user.isSuperAdmin,
    });

    res.json({
      success: true,
      message: `Login successful via ${platform}`,
      data: {
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          organizationId: user.organizationId,
          workspaceId,
        },
        token,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}
