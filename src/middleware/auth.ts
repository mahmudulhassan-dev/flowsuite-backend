import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/auth';
import { prisma } from '../lib/prisma';
import type { AuthUser, JwtPayload } from '../types/auth';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      tokenPayload?: JwtPayload;
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  try {
    const token = header.slice(7);
    const payload = verifyToken(token);

    const dbUser = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isSuperAdmin: true,
        organizationId: true,
      },
    });

    if (!dbUser) {
      res.status(401).json({ success: false, error: 'Account no longer exists' });
      return;
    }

    req.tokenPayload = payload;
    req.user = {
      id: dbUser.id,
      email: dbUser.email,
      fullName: dbUser.fullName,
      role: dbUser.role,
      organizationId: dbUser.organizationId,
      workspaceId: payload.workspaceId,
      isSuperAdmin: dbUser.isSuperAdmin,
    };
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user?.isSuperAdmin) {
    res.status(403).json({ success: false, error: 'SuperAdmin access required' });
    return;
  }
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ success: false, error: 'You do not have permission to do this' });
      return;
    }
    next();
  };
}

export function requireWorkspace(req: Request, res: Response, next: NextFunction): void {
  if (!req.user?.workspaceId) {
    res.status(403).json({ success: false, error: 'Workspace context required' });
    return;
  }
  next();
}
