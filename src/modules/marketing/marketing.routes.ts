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

// -----------------------------------------------------------------------------
// 1. SMTP SERVERS CRUD
// -----------------------------------------------------------------------------

router.get('/smtp', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  const servers = await prisma.marketingSmtpServer.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' }
  });
  res.json({ success: true, data: servers });
});

router.post('/smtp', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  const { name, host, port, secure = true, username, password, fromEmail, fromName } = req.body;

  if (!name || !host || !port || !username || !password || !fromEmail) {
    return res.status(400).json({ success: false, error: 'All fields are required' });
  }

  const server = await prisma.marketingSmtpServer.create({
    data: {
      workspaceId,
      name,
      host,
      port: parseInt(port),
      secure: Boolean(secure),
      username,
      password,
      fromEmail,
      fromName: fromName || name
    }
  });

  res.status(201).json({ success: true, data: server });
});

router.delete('/smtp/:id', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  await prisma.marketingSmtpServer.delete({
    where: { id: req.params.id, workspaceId }
  });
  res.json({ success: true });
});

// -----------------------------------------------------------------------------
// 2. TEMPLATES CRUD
// -----------------------------------------------------------------------------

router.get('/templates', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  const templates = await prisma.emailTemplate.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' }
  });
  res.json({ success: true, data: templates });
});

router.post('/templates', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  const { name, subject, htmlBody, designJson = {} } = req.body;

  if (!name || !subject || !htmlBody) {
    return res.status(400).json({ success: false, error: 'name, subject, and htmlBody are required' });
  }

  const template = await prisma.emailTemplate.create({
    data: {
      workspaceId,
      name,
      subject,
      htmlBody,
      designJson: designJson || {}
    }
  });

  res.status(201).json({ success: true, data: template });
});

router.delete('/templates/:id', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  await prisma.emailTemplate.delete({
    where: { id: req.params.id, workspaceId }
  });
  res.json({ success: true });
});

// -----------------------------------------------------------------------------
// 3. CAMPAIGNS
// -----------------------------------------------------------------------------

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

router.post('/campaigns/:campaignId/send', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  
  // Verify campaign belongs to workspace
  const check = await prisma.campaign.findFirst({
    where: { id: req.params.campaignId, workspaceId }
  });
  if (!check) return res.status(404).json({ success: false, error: 'Campaign not found' });

  // Update status to SENDING
  const campaign = await prisma.campaign.update({
    where: { id: req.params.campaignId },
    data: { status: CampaignStatus.SENDING },
  });

  // Simulating background bulk delivery in a mock environment (e.g. 100 emails sent)
  setTimeout(async () => {
    try {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          status: CampaignStatus.COMPLETED,
          sentCount: 148 // mock recipient reach
        }
      });
    } catch (e) {
      console.error('Failed to complete background campaign dispatch simulation', e);
    }
  }, 3000);

  res.json({ success: true, message: 'Campaign queued and sending in background', data: campaign });
});

router.delete('/campaigns/:campaignId', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  await prisma.campaign.delete({ where: { id: req.params['campaignId'], workspaceId } });
  res.json({ success: true });
});

// Smart mock logs for campaign open/click ratios
router.get('/campaigns/:campaignId/stats', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  const campaign = await prisma.campaign.findFirst({
    where: { id: req.params.campaignId, workspaceId }
  });

  if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });

  const totalSent = campaign.sentCount || 100;
  res.json({
    success: true,
    data: {
      sent: totalSent,
      opened: Math.round(totalSent * 0.42), // 42% Open rate mock
      clicked: Math.round(totalSent * 0.18), // 18% Click rate mock
      bounced: Math.round(totalSent * 0.02),
      unsubscribed: Math.round(totalSent * 0.01)
    }
  });
});

// -----------------------------------------------------------------------------
// 4. SMART CAMPAIGN TRACKING SYSTEM (PUBLIC ENDPOINTS)
// -----------------------------------------------------------------------------

// Open Tracking (1x1 Transparent Pixel)
router.get('/tracking/open', async (req: Request, res: Response) => {
  const { campaignId } = req.query;
  console.log(`👁️ Email Open captured for campaign [${campaignId}]`);

  // Record metrics if campaign is active
  if (campaignId) {
    try {
      await prisma.campaign.updateMany({
        where: { id: String(campaignId) },
        data: { sentCount: { increment: 1 } } // Mock incrementing stats
      });
    } catch (e) {
      // Ignored for tracking pixel isolation
    }
  }

  // Return a tiny 1x1 transparent GIF
  const pixel = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'base64'
  );
  res.writeHead(200, {
    'Content-Type': 'image/gif',
    'Content-Length': pixel.length,
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  });
  res.end(pixel);
});

// Click Link Redirection Tracking
router.get('/tracking/click', async (req: Request, res: Response) => {
  const { campaignId, url } = req.query;
  console.log(`🔗 Email Link Click captured for campaign [${campaignId}] to: ${url}`);

  const redirectUrl = url ? String(url) : 'https://suite.amanasuite.com';

  res.redirect(302, redirectUrl);
});

export default router;
