import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { io } from '../../server';
import { SocialPlatform, ThreadStatus, SenderType } from '@prisma/client';

const router = Router();

// Helper to map query platform to SocialPlatform enum
const mapPlatform = (channel: string): SocialPlatform => {
  const norm = String(channel).toUpperCase();
  if (norm === 'EMAIL' || norm === 'GMAIL') return SocialPlatform.GMAIL;
  if (norm === 'SMS') return SocialPlatform.SMS;
  if (norm === 'WHATSAPP') return SocialPlatform.WHATSAPP;
  if (norm === 'WEB_CHAT') return SocialPlatform.WEB_CHAT;
  return SocialPlatform.GMAIL;
};

// Helper to map status to ThreadStatus enum
const mapThreadStatus = (status: string): ThreadStatus => {
  const norm = String(status).toUpperCase();
  if (norm === 'OPEN') return ThreadStatus.OPEN;
  if (norm === 'PENDING') return ThreadStatus.PENDING;
  if (norm === 'RESOLVED') return ThreadStatus.RESOLVED;
  if (norm === 'BOT_HANDLED') return ThreadStatus.BOT_HANDLED;
  return ThreadStatus.OPEN;
};

// GET /api/v1/inbox/threads
router.get('/threads', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  const { channel, status, search } = req.query;

  const where: Record<string, any> = { workspaceId };
  if (channel) where['channel'] = mapPlatform(String(channel));
  if (status) where['status'] = mapThreadStatus(String(status));
  if (search) {
    where['OR'] = [
      { customerName: { contains: String(search), mode: 'insensitive' } },
      { customerEmail: { contains: String(search), mode: 'insensitive' } },
      { customerPhone: { contains: String(search), mode: 'insensitive' } },
    ];
  }

  const threads = await prisma.inboxThread.findMany({
    where,
    orderBy: { lastMessageAt: 'desc' },
    take: 50,
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  res.json({ success: true, data: threads });
});

// GET /api/v1/inbox/threads/:threadId
router.get('/threads/:threadId', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  const thread = await prisma.inboxThread.findFirst({
    where: { id: req.params['threadId'], workspaceId },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!thread) return res.status(404).json({ success: false, error: 'Thread not found' });
  res.json({ success: true, data: thread });
});

// POST /api/v1/inbox/threads/:threadId/messages
router.post('/threads/:threadId/messages', async (req: Request, res: Response) => {
  const { workspaceId, userId } = (req as any).user;
  const { content, type = 'TEXT' } = req.body;

  const thread = await prisma.inboxThread.findFirst({
    where: { id: req.params['threadId'], workspaceId },
  });
  if (!thread) return res.status(404).json({ success: false, error: 'Thread not found' });

  const message = await prisma.inboxMessage.create({
    data: {
      workspaceId,
      threadId: thread.id,
      senderType: SenderType.AGENT,
      senderId: userId,
      messageType: String(type).toUpperCase(),
      body: content,
    },
  });

  await prisma.inboxThread.update({
    where: { id: thread.id },
    data: { lastMessageAt: new Date() },
  });

  // Emit real-time event
  io.to(`workspace:${workspaceId}`).emit('inbox:message', { threadId: thread.id, message });

  res.json({ success: true, data: message });
});

// PATCH /api/v1/inbox/threads/:threadId
router.patch('/threads/:threadId', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  const { status, assignedStaffId } = req.body;

  const thread = await prisma.inboxThread.update({
    where: { id: req.params['threadId'], workspaceId },
    data: {
      ...(status && { status: mapThreadStatus(status) }),
      ...(assignedStaffId && { assignedStaffId }),
    },
  });
  res.json({ success: true, data: thread });
});

// POST /api/v1/inbox/threads (create manual thread)
router.post('/threads', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  const { customerName, customerEmail, customerPhone, channel = 'email' } = req.body;

  if (!customerName) {
    return res.status(400).json({ success: false, error: 'customerName required' });
  }

  const thread = await prisma.inboxThread.create({
    data: {
      workspaceId,
      customerName,
      customerEmail,
      customerPhone,
      externalSenderId: customerEmail || customerPhone || `manual-${Date.now()}`,
      channel: mapPlatform(channel),
      status: ThreadStatus.OPEN,
    },
  });
  res.status(201).json({ success: true, data: thread });
});

export default router;
