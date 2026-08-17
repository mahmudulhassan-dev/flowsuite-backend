import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma';

const router = Router();

// GET /api/v1/workspace/list
router.get('/list', async (req: Request, res: Response) => {
  const { organizationId } = (req as any).user;

  const workspaces = await prisma.workspace.findMany({
    where: { organizationId },
    include: {
      settings: true,
    },
  });

  res.json({ success: true, data: workspaces });
});

// GET /api/v1/workspace/:workspaceId/settings
router.get('/:workspaceId/settings', async (req: Request, res: Response) => {
  const { organizationId } = (req as any).user;
  const { workspaceId } = req.params;

  const settings = await prisma.workspaceSettings.findFirst({
    where: {
      workspaceId,
      workspace: { organizationId },
    },
  });

  if (!settings) {
    return res.status(404).json({ success: false, error: 'Workspace settings not found' });
  }

  res.json({ success: true, data: settings });
});

// PATCH /api/v1/workspace/:workspaceId/settings
router.patch('/:workspaceId/settings', async (req: Request, res: Response) => {
  const { organizationId } = (req as any).user;
  const { workspaceId } = req.params;
  const { timezone, countryCode, defaultLanguage } = req.body;

  // Verify workspace ownership
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, organizationId },
  });

  if (!workspace) {
    return res.status(404).json({ success: false, error: 'Workspace not found' });
  }

  const updatedSettings = await prisma.workspaceSettings.upsert({
    where: { workspaceId },
    create: {
      workspaceId,
      timezone: timezone || 'Asia/Dhaka',
      countryCode: countryCode || 'BD',
      defaultLanguage: defaultLanguage || 'bn',
    },
    update: {
      ...(timezone && { timezone }),
      ...(countryCode && { countryCode }),
      ...(defaultLanguage && { defaultLanguage }),
    },
  });

  res.json({ success: true, data: updatedSettings });
});

// POST /api/v1/workspace/create
router.post('/create', async (req: Request, res: Response) => {
  const { organizationId, userId } = (req as any).user;
  const { name, description } = req.body;

  if (!name) {
    return res.status(400).json({ success: false, error: 'Workspace name is required' });
  }

  const result = await prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.create({
      data: {
        organizationId,
        name,
        description,
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

    await tx.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId,
        role: 'ADMIN',
      },
    });

    return workspace;
  });

  res.status(201).json({ success: true, data: result });
});

export default router;
