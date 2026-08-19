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
  if (channel) where['platform'] = mapPlatform(String(channel));
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

  // Forward WhatsApp reply to customer phone
  if (thread.platform === SocialPlatform.WHATSAPP && thread.externalSenderId) {
    try {
      const { activeSessions } = require('../whatsapp/baileys.service');
      const session = activeSessions[workspaceId];
      if (session && session.socket && session.status === 'CONNECTED') {
        await session.socket.sendMessage(thread.externalSenderId, { text: content });
      }
    } catch (e) {
      console.error('Failed to forward agent response via Baileys WhatsApp socket:', e);
    }
  }

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
      platform: mapPlatform(channel),
      status: ThreadStatus.OPEN,
    },
  });
  res.status(201).json({ success: true, data: thread });
});

// POST /api/v1/inbox/webhook/incoming (simulate/receive customer message & trigger AI chatbot reply)
router.post('/webhook/incoming', async (req: Request, res: Response) => {
  const { threadId, content } = req.body;

  if (!threadId || !content) {
    return res.status(400).json({ success: false, error: 'threadId and content required' });
  }

  const thread = await prisma.inboxThread.findUnique({
    where: { id: threadId },
  });
  if (!thread) return res.status(404).json({ success: false, error: 'Thread not found' });

  // 1. Create the customer message
  const customerMessage = await prisma.inboxMessage.create({
    data: {
      workspaceId: thread.workspaceId,
      threadId: thread.id,
      senderType: SenderType.CUSTOMER,
      body: content,
    },
  });

  await prisma.inboxThread.update({
    where: { id: thread.id },
    data: { lastMessageAt: new Date() },
  });

  // Emit to socket
  io.to(`workspace:${thread.workspaceId}`).emit('inbox:message', { threadId: thread.id, message: customerMessage });

  // 2. Trigger AI Chatbot Response using NaraRouter API
  let botReply = '';
  const apiKey = process.env.NARA_ROUTER_API_KEY;

  if (apiKey) {
    try {
      const systemPrompt = "You are an AI virtual support agent for FlowSuite, an omnichannel marketing and CRM SaaS platform. Answer the customer's question politely, concisely (under 3 sentences), and professionally. If you cannot help, ask them to wait for a human agent.";
      const model = process.env.NARA_ROUTER_MODEL || 'deepseek-v4-flash-free';

      const response = await fetch('https://router.bynara.id/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: content },
          ],
          temperature: 0.7,
        }),
      });

      if (response.ok) {
        const data = await response.json() as any;
        botReply = data?.choices?.[0]?.message?.content || '';
      }
    } catch (e) {
      console.error('Chatbot fail to connect to NaraRouter:', e);
    }
  }

  if (!botReply) {
    botReply = "Thank you for writing to us. Our support team has been notified, and we will get back to you shortly.";
  }

  // 3. Create the AI Bot reply message
  const botMessage = await prisma.inboxMessage.create({
    data: {
      workspaceId: thread.workspaceId,
      threadId: thread.id,
      senderType: SenderType.AI_BOT,
      body: botReply,
    },
  });

  // Emit bot reply to socket
  io.to(`workspace:${thread.workspaceId}`).emit('inbox:message', { threadId: thread.id, message: botMessage });

  res.json({ success: true, customerMessage, botMessage });
});

export default router;
