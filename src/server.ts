import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { ENV } from './config/env';
import { register, login, me } from './modules/auth/auth.controller';
import { authenticate } from './middleware/auth';
import { verifyToken } from './utils/auth';

// Module routes
import inboxRouter from './modules/inbox/inbox.routes';
import publisherRouter from './modules/publisher/publisher.routes';
import crmRouter from './modules/crm/crm.routes';
import marketingRouter from './modules/marketing/marketing.routes';
import aiRouter from './modules/ai/ai.routes';
import billingRouter from './modules/billing/billing.routes';
import workspaceRouter from './modules/workspace/workspace.routes';
import adminRouter from './modules/admin/admin.routes';
import { shortenerRouter, publicShortenerRouter } from './modules/shortener/shortener.routes';
import qrRouter from './modules/qr/qr.routes';
import { biolinkRouter, publicBiolinkRouter } from './modules/biolink/biolink.routes';

const app = express();
const httpServer = createServer(app);

// Socket.io setup
export const io = new SocketIOServer(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  path: '/socket.io',
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication required'));
  try {
    const payload = verifyToken(token);
    (socket as any).userId = payload.userId;
    (socket as any).workspaceId = payload.workspaceId;
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  const workspaceId = (socket as any).workspaceId;
  socket.join(`workspace:${workspaceId}`);
  console.log(`🔌 Socket connected: ${socket.id} → workspace:${workspaceId}`);

  socket.on('join:thread', (threadId: string) => {
    socket.join(`thread:${threadId}`);
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Socket disconnected: ${socket.id}`);
  });
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

// Health routes
app.get('/', (_req: Request, res: Response) => {
  res.json({ status: 'OK', service: 'FlowSuite Backend API', version: '2.0.0', timestamp: new Date().toISOString() });
});

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'OK', service: 'FlowSuite Backend API Engine', version: '2.0.0', timestamp: new Date().toISOString(), environment: ENV.NODE_ENV });
});

// Auth routes
app.post('/api/v1/auth/register', register);
app.post('/api/v1/auth/login', login);
app.get('/api/v1/auth/me', authenticate, me);

// Feature module routes
app.use('/api/v1/inbox', authenticate, inboxRouter);
app.use('/api/v1/publisher', authenticate, publisherRouter);
app.use('/api/v1/crm', authenticate, crmRouter);
app.use('/api/v1/marketing', authenticate, marketingRouter);
app.use('/api/v1/ai', authenticate, aiRouter);
app.use('/api/v1/billing', authenticate, billingRouter);
app.use('/api/v1/workspace', authenticate, workspaceRouter);
app.use('/api/v1/links', shortenerRouter);
app.use('/api/v1/qr', qrRouter);
app.use('/api/v1/biolinks', biolinkRouter);

// Public Link Redirection & Bio Landing Rendering
app.use('/s', publicShortenerRouter);
app.use('/b', publicBiolinkRouter);

// SuperAdmin routes (no user auth — uses separate admin token check)
app.use('/admin', adminRouter);

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('❌ Unhandled error:', err.message);
  res.status(500).json({ success: false, error: err.message });
});

httpServer.listen(ENV.PORT, () => {
  console.log(`🚀 FlowSuite Backend v2.0 running on port ${ENV.PORT}`);
  console.log(`🔌 Socket.io ready at ws://localhost:${ENV.PORT}`);
});
