import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { LeadStage } from '@prisma/client';

const router = Router();

// Helper to map string stage to LeadStage enum safely
const mapLeadStage = (stage: string): LeadStage => {
  const normalized = String(stage).toUpperCase();
  if (normalized === 'NEW' || normalized === 'NEW_LEAD') return LeadStage.NEW_LEAD;
  if (normalized === 'PROSPECT') return LeadStage.PROSPECT;
  if (normalized === 'QUALIFIED') return LeadStage.QUALIFIED;
  if (normalized === 'CUSTOMER') return LeadStage.CUSTOMER;
  if (normalized === 'CHURNED') return LeadStage.CHURNED;
  return LeadStage.NEW_LEAD;
};

// CONTACTS
router.get('/contacts', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  const { search, tag } = req.query;
  const where: Record<string, any> = { workspaceId };
  if (search) {
    where['OR'] = [
      { name: { contains: String(search), mode: 'insensitive' } },
      { email: { contains: String(search), mode: 'insensitive' } },
      { phone: { contains: String(search), mode: 'insensitive' } },
    ];
  }
  if (tag) where['tags'] = { has: String(tag) };

  const contacts = await prisma.contact.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 });
  res.json({ success: true, data: contacts });
});

router.post('/contacts', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  const { name, email, phone, tags = [], stage = 'NEW_LEAD', leadScore = 0 } = req.body;
  if (!name) return res.status(400).json({ success: false, error: 'name required' });

  const contact = await prisma.contact.create({
    data: {
      workspaceId,
      name,
      email,
      phone,
      tags,
      stage: mapLeadStage(stage),
      leadScore: parseInt(leadScore) || 0,
    },
  });
  res.status(201).json({ success: true, data: contact });
});

router.patch('/contacts/:contactId', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  const { name, email, phone, tags, stage, leadScore } = req.body;

  const contact = await prisma.contact.update({
    where: { id: req.params['contactId'], workspaceId },
    data: {
      ...(name && { name }),
      ...(email && { email }),
      ...(phone && { phone }),
      ...(tags && { tags }),
      ...(stage && { stage: mapLeadStage(stage) }),
      ...(leadScore !== undefined && { leadScore: parseInt(leadScore) || 0 }),
    },
  });
  res.json({ success: true, data: contact });
});

router.delete('/contacts/:contactId', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  await prisma.contact.delete({ where: { id: req.params['contactId'], workspaceId } });
  res.json({ success: true });
});

// LEADS
router.get('/leads', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  const { stage } = req.query;
  const where: Record<string, any> = { workspaceId };
  if (stage) where['stage'] = mapLeadStage(String(stage));

  const leads = await prisma.lead.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 });
  res.json({ success: true, data: leads });
});

router.post('/leads', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  const { name, email, phone, stage = 'NEW_LEAD', score = 50, tags = [] } = req.body;
  if (!name) return res.status(400).json({ success: false, error: 'name required' });

  const lead = await prisma.lead.create({
    data: {
      workspaceId,
      name,
      email,
      phone,
      stage: mapLeadStage(stage),
      score: parseInt(score) || 50,
      tags,
    },
  });
  res.status(201).json({ success: true, data: lead });
});

router.patch('/leads/:leadId', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  const { name, email, phone, stage, score, tags } = req.body;

  const lead = await prisma.lead.update({
    where: { id: req.params['leadId'], workspaceId },
    data: {
      ...(name && { name }),
      ...(email && { email }),
      ...(phone && { phone }),
      ...(stage && { stage: mapLeadStage(stage) }),
      ...(score !== undefined && { score: parseInt(score) || 0 }),
      ...(tags && { tags }),
    },
  });
  res.json({ success: true, data: lead });
});

// PIPELINE STATS
router.get('/pipeline', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  const stages: LeadStage[] = [
    LeadStage.NEW_LEAD,
    LeadStage.PROSPECT,
    LeadStage.QUALIFIED,
    LeadStage.CUSTOMER,
    LeadStage.CHURNED,
  ];

  const pipeline = await Promise.all(
    stages.map(async (stage) => {
      const count = await prisma.lead.count({
        where: { workspaceId, stage },
      });
      // We can use score as a proxy for total value / probability weight
      const scoreSum = await prisma.lead.aggregate({
        where: { workspaceId, stage },
        _sum: { score: true },
      });
      return {
        stage,
        count,
        totalValue: scoreSum._sum.score ?? 0,
      };
    })
  );
  res.json({ success: true, data: pipeline });
});

export default router;
