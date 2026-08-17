import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma';

const router = Router();

// GET /api/v1/billing/plan
router.get('/plan', async (req: Request, res: Response) => {
  const { organizationId } = (req as any).user;

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      name: true,
      plan: true,
      aiCredits: true,
      createdAt: true,
    },
  });

  if (!org) {
    return res.status(404).json({ success: false, error: 'Organization not found' });
  }

  res.json({ success: true, data: org });
});

// POST /api/v1/billing/upgrade
router.post('/upgrade', async (req: Request, res: Response) => {
  const { organizationId } = (req as any).user;
  const { plan } = req.body;

  if (!['FREE_TRIAL', 'PRO_AGENCY', 'ENTERPRISE'].includes(plan)) {
    return res.status(400).json({ success: false, error: 'Invalid plan name' });
  }

  const updatedOrg = await prisma.organization.update({
    where: { id: organizationId },
    data: {
      plan,
      aiCredits: plan === 'ENTERPRISE' ? 500000 : plan === 'PRO_AGENCY' ? 100000 : 5000,
    },
  });

  res.json({ success: true, data: updatedOrg });
});

export default router;
