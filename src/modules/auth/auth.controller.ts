import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { hashPassword, comparePassword, generateToken } from '../../utils/auth';

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
