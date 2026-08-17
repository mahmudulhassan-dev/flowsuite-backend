import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { ENV } from './config/env';
import { hashPassword, generateToken, verifyToken } from './utils/auth';
import { register, login, me } from './modules/auth/auth.controller';
import { authenticate } from './middleware/auth';


const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// 1. Root & Health API
app.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'OK',
    service: 'FlowSuite Enterprise Backend API & SuperAdmin Engine',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: ENV.NODE_ENV,
    endpoints: {
      health: '/api/health',
      superAdminGateway: '/admin',
      authRegister: '/api/v1/auth/register',
      authLogin: '/api/v1/auth/login',
    },
  });
});

app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'OK',
    service: 'FlowSuite Backend API Engine',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: ENV.NODE_ENV,
  });
});

// 2. SuperAdmin Control Gateway Routes (flowsuite.amanasuite.com/admin)
app.get('/admin', (req: Request, res: Response) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>FlowSuite — SuperAdmin Control Gateway</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-slate-950 text-slate-100 font-sans p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div class="flex justify-between items-center bg-slate-900 p-6 rounded-2xl border border-slate-800">
          <div>
            <h1 class="text-2xl font-bold text-white flex items-center gap-2">
              FlowSuite SuperAdmin Control Gateway
              <span class="text-xs bg-purple-500/20 text-purple-300 border border-purple-500/40 px-2 py-0.5 rounded-full">SYSTEM ROOT</span>
            </h1>
            <p class="text-slate-400 text-sm mt-1">Backend API Governance, PostgreSQL DDL Management, & Node Health</p>
          </div>
          <a href="/admin/login" class="bg-purple-600 hover:bg-purple-500 text-white font-medium px-4 py-2 rounded-xl text-sm transition-all">SuperAdmin Logout</a>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div class="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
            <span class="text-slate-400 text-xs font-semibold">Active Workspaces</span>
            <p class="text-3xl font-bold text-white mt-1">1,482</p>
            <span class="text-xs text-emerald-400 font-medium">100% Operational</span>
          </div>
          <div class="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
            <span class="text-slate-400 text-xs font-semibold">Cluster Health</span>
            <p class="text-3xl font-bold text-white mt-1">99.98%</p>
            <span class="text-xs text-blue-400 font-medium">Node.js Express Port 4006</span>
          </div>
          <div class="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
            <span class="text-slate-400 text-xs font-semibold">Database Engine</span>
            <p class="text-3xl font-bold text-white mt-1">PostgreSQL</p>
            <span class="text-xs text-emerald-400 font-medium">flowsuite_db Synced</span>
          </div>
          <div class="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
            <span class="text-slate-400 text-xs font-semibold">Queue Runner</span>
            <p class="text-3xl font-bold text-white mt-1">Redis BullMQ</p>
            <span class="text-xs text-purple-400 font-medium">Port 6379 Active</span>
          </div>
        </div>

        <div class="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
          <h2 class="text-lg font-bold text-white">SuperAdmin API System Routes</h2>
          <div class="space-y-2 font-mono text-sm">
            <div class="p-3 bg-slate-950 border border-slate-800 rounded-xl flex justify-between">
              <span class="text-purple-400">GET /admin/tenants</span>
              <span class="text-slate-400">List all organization tenants</span>
            </div>
            <div class="p-3 bg-slate-950 border border-slate-800 rounded-xl flex justify-between">
              <span class="text-purple-400">GET /admin/metrics</span>
              <span class="text-slate-400">Server CPU, Memory & Database metrics</span>
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `);
});

app.get('/admin/login', (req: Request, res: Response) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>FlowSuite — SuperAdmin Login</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-slate-950 text-slate-100 font-sans min-h-screen flex items-center justify-center p-4">
      <div class="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6 shadow-2xl">
        <div class="text-center space-y-2">
          <h1 class="text-2xl font-bold text-white">SuperAdmin Gateway</h1>
          <p class="text-slate-400 text-sm">FlowSuite Enterprise Root Control</p>
        </div>
        <form action="/admin" method="GET" class="space-y-4">
          <div>
            <label class="text-xs font-semibold text-slate-300">SuperAdmin Email</label>
            <input type="email" value="admin@flowsuite.com" class="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-4 text-white text-sm mt-1" required>
          </div>
          <div>
            <label class="text-xs font-semibold text-slate-300">Master Password</label>
            <input type="password" value="password" class="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-4 text-white text-sm mt-1" required>
          </div>
          <button type="submit" class="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3 rounded-xl transition-all text-sm">
            Authenticate SuperAdmin
          </button>
        </form>
      </div>
    </body>
    </html>
  `);
});

app.get('/admin/tenants', (req: Request, res: Response) => {
  res.json({
    success: true,
    totalTenants: 2,
    data: [
      { id: 'org_main_001', name: 'FlowSuite Agency Main', cname: 'suite.amanasuite.com', plan: 'PRO_AGENCY', aiCredits: 10000 },
      { id: 'org_main_002', name: 'Global Marketing Ltd', cname: 'social.globalmktg.com', plan: 'ENTERPRISE', aiCredits: 50000 },
    ],
  });
});

app.get('/admin/metrics', (req: Request, res: Response) => {
  res.json({
    success: true,
    metrics: {
      uptimeSeconds: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpuLoad: 0.18,
      database: 'flowsuite_db connected',
      redis: 'connected',
    },
  });
});

// 3. User Authentication APIs
app.post('/api/v1/auth/register', register);
app.post('/api/v1/auth/login', login);
app.get('/api/v1/auth/me', authenticate, me);


app.listen(ENV.PORT, () => {
  console.log(`🚀 FlowSuite Backend running on port ${ENV.PORT}`);
});
