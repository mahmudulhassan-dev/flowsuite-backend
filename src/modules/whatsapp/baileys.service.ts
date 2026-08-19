import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import path from 'path';
import fs from 'fs';
import QRCode from 'qrcode';
import { prisma } from '../../lib/prisma';
import { io } from '../../server';
import { SenderType, SocialPlatform, ThreadStatus } from '@prisma/client';

interface SessionState {
  socket: WASocket | null;
  qr?: string;
  status: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'QR';
}

export const activeSessions: Record<string, SessionState> = {};

export function getSessionStatus(workspaceId: string, sessionId: string) {
  const sessionKey = `${workspaceId}:${sessionId}`;
  const session = activeSessions[sessionKey];
  if (!session) return { status: 'DISCONNECTED' };
  return { status: session.status, qr: session.qr };
}

export async function getWorkspaceSessionsStatus(workspaceId: string) {
  const accounts = await prisma.socialAccount.findMany({
    where: {
      workspaceId,
      platform: SocialPlatform.WHATSAPP_BAILEYS,
    },
  });

  const list = accounts.map(acc => {
    const sessionId = acc.accessToken;
    const sessionKey = `${workspaceId}:${sessionId}`;
    const session = activeSessions[sessionKey];
    return {
      id: acc.id,
      sessionId,
      accountName: acc.accountName,
      phone: acc.accountExternalId,
      isActive: acc.isActive,
      status: session ? session.status : (acc.isActive ? 'DISCONNECTED' : 'INACTIVE'),
      qr: session?.qr,
      sessionData: acc.sessionData
    };
  });

  // Include in-flight active sessions
  Object.entries(activeSessions).forEach(([key, session]) => {
    const [wId, sId] = key.split(':');
    if (wId === workspaceId && !list.some(x => x.sessionId === sId)) {
      list.push({
        id: `new-${sId}`,
        sessionId: sId,
        accountName: 'Pairing Device...',
        phone: '',
        isActive: true,
        status: session.status,
        qr: session.qr,
        sessionData: null
      });
    }
  });

  return list;
}

export async function disconnectSession(workspaceId: string, sessionId: string) {
  const sessionKey = `${workspaceId}:${sessionId}`;
  const session = activeSessions[sessionKey];
  if (session && session.socket) {
    try {
      await session.socket.logout();
    } catch (e) {
      console.error('Logout error:', e);
    }
  }

  delete activeSessions[sessionKey];

  const sessionDir = path.join(process.cwd(), 'sessions', `auth_info_baileys_${workspaceId}_${sessionId}`);
  try {
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
  } catch (e) {
    console.error('Error clearing session dir:', e);
  }

  await prisma.socialAccount.deleteMany({
    where: {
      workspaceId,
      platform: SocialPlatform.WHATSAPP_BAILEYS,
      accessToken: sessionId,
    },
  });

  io.to(`workspace:${workspaceId}`).emit('whatsapp:status', { sessionId, status: 'DISCONNECTED' });
}

export async function connectToWhatsApp(workspaceId: string, sessionId: string) {
  const sessionKey = `${workspaceId}:${sessionId}`;
  const existing = activeSessions[sessionKey];
  if (existing && (existing.status === 'CONNECTED' || existing.status === 'CONNECTING')) {
    return existing;
  }

  const sessionDir = path.join(process.cwd(), 'sessions', `auth_info_baileys_${workspaceId}_${sessionId}`);
  fs.mkdirSync(path.dirname(sessionDir), { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }) as any,
    printQRInTerminal: false,
  });

  activeSessions[sessionKey] = {
    socket: sock,
    status: 'CONNECTING',
  };

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        const qrBase64 = await QRCode.toDataURL(qr);
        activeSessions[sessionKey] = {
          socket: sock,
          qr: qrBase64,
          status: 'QR',
        };
        io.to(`workspace:${workspaceId}`).emit('whatsapp:qr', { sessionId, qr: qrBase64 });
      } catch (err) {
        console.error('Error generating QR Code base64:', err);
      }
    }

    if (connection === 'connecting') {
      activeSessions[sessionKey] = {
        socket: sock,
        status: 'CONNECTING',
      };
      io.to(`workspace:${workspaceId}`).emit('whatsapp:status', { sessionId, status: 'CONNECTING' });
    }

    if (connection === 'open') {
      const phone = sock.user?.id.split(':')[0] || '';
      const name = sock.user?.name || 'WhatsApp Session';

      activeSessions[sessionKey] = {
        socket: sock,
        status: 'CONNECTED',
      };
      io.to(`workspace:${workspaceId}`).emit('whatsapp:status', { sessionId, status: 'CONNECTED' });

      // Upsert the SocialAccount
      try {
        await prisma.socialAccount.upsert({
          where: {
            workspaceId_platform_accountExternalId: {
              workspaceId,
              platform: SocialPlatform.WHATSAPP_BAILEYS,
              accountExternalId: phone,
            },
          },
          update: {
            accountName: name,
            isActive: true,
            accessToken: sessionId,
          },
          create: {
            workspaceId,
            platform: SocialPlatform.WHATSAPP_BAILEYS,
            accountExternalId: phone,
            accountName: name,
            accessToken: sessionId,
            sessionData: {
              autoReplyActive: false,
              aiReplyActive: false,
              awayMessage: "Hello! We are currently offline. Our AI assistant will reply to you shortly."
            }
          },
        });
      } catch (err) {
        console.error('Failed to save SocialAccount credentials:', err);
      }
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      if (shouldReconnect) {
        connectToWhatsApp(workspaceId, sessionId);
      } else {
        activeSessions[sessionKey] = {
          socket: null,
          status: 'DISCONNECTED',
        };
        io.to(`workspace:${workspaceId}`).emit('whatsapp:status', { sessionId, status: 'DISCONNECTED' });
        
        try {
          if (fs.existsSync(sessionDir)) {
            fs.rmSync(sessionDir, { recursive: true, force: true });
          }
        } catch (e) {
          console.error('Failed to delete auth session dir:', e);
        }

        await prisma.socialAccount.deleteMany({
          where: {
            workspaceId,
            platform: SocialPlatform.WHATSAPP_BAILEYS,
            accessToken: sessionId,
          },
        });
      }
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    if (m.type !== 'notify') return;

    for (const msg of m.messages) {
      if (!msg.key.fromMe && msg.message) {
        const fromJid = msg.key.remoteJid || '';
        if (fromJid.endsWith('@g.us')) continue; // Skip group messages

        const phone = fromJid.split('@')[0];
        const bodyText = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        if (!bodyText) continue;

        const senderName = msg.pushName || 'WhatsApp Contact';

        try {
          // Lookup socialAccount matching this session
          const socialAccount = await prisma.socialAccount.findFirst({
            where: {
              workspaceId,
              platform: SocialPlatform.WHATSAPP_BAILEYS,
              accessToken: sessionId
            }
          });

          // Find or create WhatsApp Thread in Unified Inbox linked to this WhatsApp account
          let thread = await prisma.inboxThread.findFirst({
            where: {
              workspaceId,
              platform: SocialPlatform.WHATSAPP,
              externalSenderId: fromJid,
              socialAccountId: socialAccount?.id || undefined
            },
          });

          if (!thread) {
            thread = await prisma.inboxThread.create({
              data: {
                workspaceId,
                platform: SocialPlatform.WHATSAPP,
                externalSenderId: fromJid,
                customerName: senderName,
                customerPhone: phone,
                status: ThreadStatus.OPEN,
                socialAccountId: socialAccount?.id || null
              },
            });
          }

          // Create incoming message
          const message = await prisma.inboxMessage.create({
            data: {
              workspaceId,
              threadId: thread.id,
              senderType: SenderType.CUSTOMER,
              body: bodyText,
            },
          });

          // Update thread activity time
          await prisma.inboxThread.update({
            where: { id: thread.id },
            data: { lastMessageAt: new Date() },
          });

          // Emit to workspace sockets
          io.to(`workspace:${workspaceId}`).emit('inbox:message', {
            threadId: thread.id,
            message,
          });

          // Auto-responder AI checks
          if (socialAccount && socialAccount.sessionData) {
            const sessionMeta = socialAccount.sessionData as any;
            if (sessionMeta.autoReplyActive || sessionMeta.aiReplyActive) {
              setTimeout(async () => {
                let replyText = "";

                if (sessionMeta.aiReplyActive) {
                  // Fetch crawled knowledgebase memory
                  const articles = await prisma.kbArticle.findMany({
                    where: { workspaceId, isPublic: true },
                    select: { title: true, content: true }
                  });

                  const contextStr = articles.map(a => `Title: ${a.title}\nContent: ${a.content}`).join("\n\n");

                  try {
                    const systemPrompt = `You are a helpful AI assistant. Use the following context to answer the user's questions:

=== CONTEXT ===
${contextStr}
================

Answer politely, concisely (under 3 sentences), and professionally. If context does not help, answer politely using general knowledge.`;

                    const response = await fetch('https://router.bynara.id/v1/chat/completions', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer sk-nry--4y04F-Kcj0sns6ZAym8ioYjDT3-TGO60fDhSgBF3GI`
                      },
                      body: JSON.stringify({
                        model: 'deepseek-v4-flash-free',
                        messages: [
                          { role: 'system', content: systemPrompt },
                          { role: 'user', content: bodyText }
                        ],
                        temperature: 0.7
                      })
                    });

                    const resJson = await response.json() as any;
                    replyText = resJson?.choices?.[0]?.message?.content || "";
                  } catch (err) {
                    console.error('NaraRouter AI completion failed:', err);
                  }
                }

                if (!replyText && sessionMeta.autoReplyActive) {
                  replyText = sessionMeta.awayMessage || "Hello! We are currently offline. Our team will contact you shortly.";
                }

                if (replyText) {
                  const socketObj = activeSessions[sessionKey]?.socket;
                  if (socketObj) {
                    await socketObj.sendMessage(fromJid, { text: replyText });

                    const botMessage = await prisma.inboxMessage.create({
                      data: {
                        workspaceId,
                        threadId: thread!.id,
                        senderType: SenderType.AI_BOT,
                        body: replyText
                      }
                    });

                    io.to(`workspace:${workspaceId}`).emit('inbox:message', {
                      threadId: thread!.id,
                      message: botMessage
                    });
                  }
                }
              }, 2500);
            }
          }

        } catch (err) {
          console.error('Failed to store incoming WhatsApp message:', err);
        }
      }
    }
  });

  return activeSessions[sessionKey];
}

export async function loadActiveSessions() {
  try {
    const accounts = await prisma.socialAccount.findMany({
      where: {
        platform: SocialPlatform.WHATSAPP_BAILEYS,
        isActive: true,
      },
    });

    console.log(`🔌 Initializing ${accounts.length} active WhatsApp sessions...`);
    for (const acc of accounts) {
      connectToWhatsApp(acc.workspaceId, acc.accessToken);
    }
  } catch (err) {
    console.error('Failed to load active WhatsApp sessions on startup:', err);
  }
}
