import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/auth';
import type { AuthUser, JwtPayload } from '../types/auth';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      tokenPayload?: JwtPayload;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  try {
    const token = header.slice(7);
    const payload = verifyToken(token);
    req.tokenPayload = payload;
    req.user = {
      id: payload.userId,
      email: payload.email,
      fullName: '',
      role: 'ADMIN',
      organizationId: payload.organizationId,
      workspaceId: payload.workspaceId,
      isSuperAdmin: payload.isSuperAdmin,
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

export function requireWorkspace(req: Request, res: Response, next: NextFunction): void {
  if (!req.user?.workspaceId) {
    res.status(403).json({ success: false, error: 'Workspace context required' });
    return;
  }
  next();
}
