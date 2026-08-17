import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { CampaignType, CampaignStatus } from '@prisma/client';

const router = Router();

// Helper to map string type to CampaignType
const mapCampaignType = (type: string): CampaignType => {
  const norm = String(type).toUpperCase();
  if (norm === 'EMAIL') return CampaignType.EMAIL;
  if (norm === 'SMS') return CampaignType.SMS;
  if (norm === 'WHATSAPP') return CampaignType.WHATSAPP;
  if (norm === 'PUSH') return CampaignType.PUSH;
  return CampaignType.EMAIL;
};

// Helper to map string status to CampaignStatus
const mapCampaignStatus = (status: string): CampaignStatus => {
  const norm = String(status).toUpperCase();
  if (norm === 'DRAFT') return CampaignStatus.DRAFT;
  if (norm === 'SCHEDULED') return CampaignStatus.SCHEDULED;
  if (norm === 'SENDING') return CampaignStatus.SENDING;
  if (norm === 'COMPLETED') return CampaignStatus.COMPLETED;
  if (norm === 'FAILED') return CampaignStatus.FAILED;
  return CampaignStatus.DRAFT;
};

// CAMPAIGNS
router.get('/campaigns', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  const { status, type } = req.query;
  const where: Record<string, any> = { workspaceId };
  if (status) where['status'] = mapCampaignStatus(String(status));
  if (type) where['type'] = mapCampaignType(String(type));

  const campaigns = await prisma.campaign.findMany({ where, orderBy: { createdAt: 'desc' } });
  res.json({ success: true, data: campaigns });
});

router.post('/campaigns', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  const { name, type = 'email', subject, content, scheduledAt } = req.body;
  if (!name || !content) return res.status(400).json({ success: false, error: 'name and content required' });

  const campaign = await prisma.campaign.create({
    data: {
      workspaceId,
      name,
      type: mapCampaignType(type),
      subject,
      body: content,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      status: CampaignStatus.DRAFT,
    },
  });
  res.status(201).json({ success: true, data: campaign });
});

router.patch('/campaigns/:campaignId', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  const { name, type, subject, content, scheduledAt, status } = req.body;

  const campaign = await prisma.campaign.update({
    where: { id: req.params['campaignId'], workspaceId },
    data: {
      ...(name && { name }),
      ...(type && { type: mapCampaignType(type) }),
      ...(subject && { subject }),
      ...(content && { body: content }),
      ...(scheduledAt !== undefined && { scheduledAt: scheduledAt ? new Date(scheduledAt) : null }),
      ...(status && { status: mapCampaignStatus(status) }),
    },
  });
  res.json({ success: true, data: campaign });
});

router.post('/campaigns/:campaignId/send', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  const campaign = await prisma.campaign.update({
    where: { id: req.params['campaignId'], workspaceId },
    data: { status: CampaignStatus.SENDING },
  });
  // In future: Dispatch BullMQ job for actual sending
  res.json({ success: true, message: 'Campaign queued for delivery', data: campaign });
});

router.delete('/campaigns/:campaignId', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  await prisma.campaign.delete({ where: { id: req.params['campaignId'], workspaceId } });
  res.json({ success: true });
});

// CAMPAIGN STATS
router.get('/campaigns/:campaignId/stats', async (req: Request, res: Response) => {
  res.json({ success: true, data: { sent: 0, opened: 0, clicked: 0, bounced: 0, unsubscribed: 0 } });
});

export default router;
