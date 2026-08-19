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

const activeSessions: Record<string, SessionState> = {};

export function getSessionStatus(workspaceId: string) {
  const session = activeSessions[workspaceId];
  if (!session) return { status: 'DISCONNECTED' };
  return { status: session.status, qr: session.qr };
}

export async function disconnectSession(workspaceId: string) {
  const session = activeSessions[workspaceId];
  if (session && session.socket) {
    try {
      await session.socket.logout();
    } catch (e) {
      console.error('Logout error:', e);
    }
  }

  delete activeSessions[workspaceId];

  const sessionDir = path.join(process.cwd(), 'sessions', `auth_info_baileys_${workspaceId}`);
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
    },
  });

  io.to(`workspace:${workspaceId}`).emit('whatsapp:status', { status: 'DISCONNECTED' });
}

export async function connectToWhatsApp(workspaceId: string) {
  // If already connecting or connected, don't re-initialize
  const existing = activeSessions[workspaceId];
  if (existing && (existing.status === 'CONNECTED' || existing.status === 'CONNECTING')) {
    return existing;
  }

  const sessionDir = path.join(process.cwd(), 'sessions', `auth_info_baileys_${workspaceId}`);
  fs.mkdirSync(path.dirname(sessionDir), { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }) as any,
    printQRInTerminal: false,
  });

  activeSessions[workspaceId] = {
    socket: sock,
    status: 'CONNECTING',
  };

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        const qrBase64 = await QRCode.toDataURL(qr);
        activeSessions[workspaceId] = {
          socket: sock,
          qr: qrBase64,
          status: 'QR',
        };
        io.to(`workspace:${workspaceId}`).emit('whatsapp:qr', { qr: qrBase64 });
      } catch (err) {
        console.error('Error generating QR Code base64:', err);
      }
    }

    if (connection === 'connecting') {
      activeSessions[workspaceId] = {
        socket: sock,
        status: 'CONNECTING',
      };
      io.to(`workspace:${workspaceId}`).emit('whatsapp:status', { status: 'CONNECTING' });
    }

    if (connection === 'open') {
      const phone = sock.user?.id.split(':')[0] || '';
      const name = sock.user?.name || 'WhatsApp Session';

      activeSessions[workspaceId] = {
        socket: sock,
        status: 'CONNECTED',
      };
      io.to(`workspace:${workspaceId}`).emit('whatsapp:status', { status: 'CONNECTED' });

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
            accessToken: 'baileys_session',
          },
          create: {
            workspaceId,
            platform: SocialPlatform.WHATSAPP_BAILEYS,
            accountExternalId: phone,
            accountName: name,
            accessToken: 'baileys_session',
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
        // Retry connection
        connectToWhatsApp(workspaceId);
      } else {
        // Disconnected permanently
        activeSessions[workspaceId] = {
          socket: null,
          status: 'DISCONNECTED',
        };
        io.to(`workspace:${workspaceId}`).emit('whatsapp:status', { status: 'DISCONNECTED' });
        
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
          // Find or create WhatsApp Thread in Unified Inbox
          let thread = await prisma.inboxThread.findFirst({
            where: {
              workspaceId,
              platform: SocialPlatform.WHATSAPP,
              externalSenderId: fromJid,
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
        } catch (err) {
          console.error('Failed to store incoming WhatsApp message:', err);
        }
      }
    }
  });

  return activeSessions[workspaceId];
}

// Automatically load and start active Baileys sessions on system startup
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
      connectToWhatsApp(acc.workspaceId);
    }
  } catch (err) {
    console.error('Failed to load active WhatsApp sessions on startup:', err);
  }
}
