import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { ENV } from './config/env';
import { hashPassword, generateToken, verifyToken } from './utils/auth';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'OK',
    service: 'FlowSuite Backend API Engine',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: ENV.NODE_ENV,
  });
});

app.post('/api/v1/auth/register', async (req: Request, res: Response) => {
  try {
    const { email, password, fullName, organizationName } = req.body;
    if (!email || !password || !fullName || !organizationName) {
      return res.status(400).json({ success: false, error: 'All fields are required' });
    }
    const hashedPassword = await hashPassword(password);
    const mockUser = { id: 'usr_' + Date.now(), email, fullName, isSuperAdmin: false, organization: organizationName };
    const token = generateToken({ userId: mockUser.id, email: mockUser.email, isSuperAdmin: false });
    return res.status(201).json({ success: true, message: 'Registration successful', data: { user: mockUser, token } });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/v1/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password required' });
    }
    const mockUser = { id: 'usr_1001', email, fullName: 'FlowSuite Admin', isSuperAdmin: false };
    const token = generateToken({ userId: mockUser.id, email: mockUser.email, isSuperAdmin: false });
    return res.json({ success: true, message: 'Login successful', data: { user: mockUser, token } });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(ENV.PORT, () => {
  console.log(`🚀 FlowSuite Backend running on port ${ENV.PORT}`);
});
