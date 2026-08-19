import { Router, Request, Response } from 'express';
import { connectToWhatsApp, getWorkspaceSessionsStatus, disconnectSession } from './baileys.service';
import { prisma } from '../../lib/prisma';
import { SocialPlatform } from '@prisma/client';

const router = Router();

// POST /api/v1/whatsapp/connect
router.post('/connect', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = (req as any).user;
    let { sessionId } = req.body;
    if (!sessionId) {
      sessionId = `sess_${Math.random().toString(36).substring(2, 11)}`;
    }
    await connectToWhatsApp(workspaceId, sessionId);
    res.json({ success: true, data: { sessionId }, message: 'Pairing session initialized' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/whatsapp/status
router.get('/status', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = (req as any).user;
    const statuses = await getWorkspaceSessionsStatus(workspaceId);
    res.json({ success: true, data: statuses });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/whatsapp/disconnect
router.post('/disconnect', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = (req as any).user;
    const { sessionId } = req.body;
    if (!sessionId) {
      res.status(400).json({ success: false, error: 'Session ID is required to disconnect' });
      return;
    }
    await disconnectSession(workspaceId, sessionId);
    res.json({ success: true, message: 'WhatsApp session disconnected' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

interface AutoReplyRuleInput {
  keywords: string[];
  response: string;
  matchType?: 'contains' | 'exact' | 'starts_with';
}

function sanitizeRules(input: unknown): AutoReplyRuleInput[] {
  if (!Array.isArray(input)) return [];
  const valid: Array<AutoReplyRuleInput['matchType']> = ['contains', 'exact', 'starts_with'];
  return input
    .map((r: any) => {
      const keywords = Array.isArray(r?.keywords)
        ? r.keywords.map((k: any) => String(k).trim()).filter(Boolean)
        : [];
      const response = typeof r?.response === 'string' ? r.response.trim() : '';
      const matchType = valid.includes(r?.matchType) ? r.matchType : 'contains';
      return { keywords, response, matchType } as AutoReplyRuleInput;
    })
    .filter((r) => r.keywords.length > 0 && r.response.length > 0);
}

// GET /api/v1/whatsapp/settings?sessionId=...
// Returns the current automation preferences for a WhatsApp account.
router.get('/settings', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = (req as any).user;
    const sessionId = req.query.sessionId as string | undefined;
    if (!sessionId) {
      res.status(400).json({ success: false, error: 'Session ID is required' });
      return;
    }

    const socialAccount = await prisma.socialAccount.findFirst({
      where: { workspaceId, platform: SocialPlatform.WHATSAPP_BAILEYS, accessToken: sessionId },
    });
    if (!socialAccount) {
      res.status(404).json({ success: false, error: 'WhatsApp session account not found' });
      return;
    }

    res.json({ success: true, data: socialAccount.sessionData || {} });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to load settings' });
  }
});

// POST /api/v1/whatsapp/settings
// Configure per-account auto-responder options (saved inside SocialAccount.sessionData JSON column)
router.post('/settings', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = (req as any).user;
    const { sessionId, autoReplyActive, aiReplyActive, awayMessage, welcomeMessage, autoReplyRules } = req.body;

    if (!sessionId) {
      res.status(400).json({ success: false, error: 'Session ID is required' });
      return;
    }

    const socialAccount = await prisma.socialAccount.findFirst({
      where: {
        workspaceId,
        platform: SocialPlatform.WHATSAPP_BAILEYS,
        accessToken: sessionId
      }
    });

    if (!socialAccount) {
      res.status(404).json({ success: false, error: 'WhatsApp session account not found' });
      return;
    }

    const existing = (socialAccount.sessionData as Record<string, any>) || {};

    const updatedData = {
      ...existing,
      autoReplyActive: !!autoReplyActive,
      aiReplyActive: !!aiReplyActive,
      awayMessage: awayMessage ?? existing.awayMessage ?? 'Hello! We are currently offline. Our AI assistant will reply shortly.',
      welcomeMessage: welcomeMessage ?? existing.welcomeMessage ?? '',
      autoReplyRules: autoReplyRules !== undefined ? sanitizeRules(autoReplyRules) : (existing.autoReplyRules || []),
    };

    await prisma.socialAccount.update({
      where: { id: socialAccount.id },
      data: {
        sessionData: updatedData
      }
    });

    res.json({ success: true, data: updatedData, message: 'WhatsApp automation preferences updated successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
