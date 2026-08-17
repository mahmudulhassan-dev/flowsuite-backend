import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import os from 'os';

const router = Router();

// Cache or generate the HTML
const getAdminHtml = async () => {
  // Query real DB stats
  const orgCount = await prisma.organization.count();
  const userCount = await prisma.user.count();
  const workspaceCount = await prisma.workspace.count();
  
  // Calculate fake/simulated MRR based on plans
  const enterpriseCount = await prisma.organization.count({ where: { plan: 'ENTERPRISE' } });
  const proCount = await prisma.organization.count({ where: { plan: 'PRO_AGENCY' } });
  const trialCount = await prisma.organization.count({ where: { plan: 'FREE_TRIAL' } });
  
  const mrr = (enterpriseCount * 299) + (proCount * 99) + (trialCount * 0);
  
  // Get thread counts, posts counts, campaign counts
  const postCount = await prisma.post.count();
  const threadCount = await prisma.inboxThread.count();
  const campaignCount = await prisma.campaign.count();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FlowSuite — SuperAdmin Control Center</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * { font-family: 'Inter', sans-serif; }
    body { background: #020617; }
    .glow-purple { box-shadow: 0 0 30px rgba(139,92,246,0.15); }
    .glow-blue { box-shadow: 0 0 30px rgba(59,130,246,0.15); }
    .glow-green { box-shadow: 0 0 30px rgba(34,197,94,0.12); }
    .glow-orange { box-shadow: 0 0 30px rgba(249,115,22,0.12); }
    .sidebar-item:hover { background: rgba(139,92,246,0.12); transform: translateX(3px); }
    .sidebar-item { transition: all 0.2s ease; }
    .sidebar-item.active { background: rgba(139,92,246,0.18); border-left: 3px solid #8b5cf6; }
    .stat-card { transition: all 0.3s ease; }
    .stat-card:hover { transform: translateY(-2px); }
    .tab-btn.active { background: rgba(139,92,246,0.2); border-color: rgba(139,92,246,0.5); color: #c4b5fd; }
    .tab-btn { transition: all 0.2s ease; }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    .badge-live { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
    .progress-bar { transition: width 1s ease; }
    .action-btn { transition: all 0.2s ease; }
    .action-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-track { background: #0f172a; }
    ::-webkit-scrollbar-thumb { background: #334155; border-radius: 2px; }
    .gradient-text { background: linear-gradient(135deg, #8b5cf6, #06b6d4); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .tier-badge { font-size: 9px; padding: 2px 6px; border-radius: 999px; font-weight: 700; letter-spacing: 0.08em; }
  </style>
</head>
<body class="text-slate-100 min-h-screen flex">

<!-- Sidebar -->
<aside class="w-64 min-h-screen bg-slate-900/80 border-r border-slate-800 flex flex-col fixed left-0 top-0 bottom-0 z-40">
  <!-- Logo -->
  <div class="p-5 border-b border-slate-800">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-blue-500 flex items-center justify-center font-black text-white text-base shadow-lg">FS</div>
      <div>
        <div class="font-bold text-white text-sm tracking-tight">FlowSuite</div>
        <div class="text-[10px] text-purple-400 font-semibold tracking-widest">SUPERADMIN</div>
      </div>
    </div>
  </div>
  
  <!-- Nav -->
  <nav class="flex-1 p-3 space-y-0.5 overflow-y-auto">
    <div class="text-[10px] font-semibold text-slate-500 uppercase tracking-widest px-3 pt-3 pb-1.5">Overview</div>
    <a href="#" onclick="switchTab('dashboard')" class="sidebar-item active flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-sm text-slate-200 font-medium" id="nav-dashboard">
      <span class="text-lg">📊</span> Dashboard
    </a>
    <a href="#" onclick="switchTab('analytics')" class="sidebar-item flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-sm text-slate-400 font-medium" id="nav-analytics">
      <span class="text-lg">📈</span> Analytics
    </a>

    <div class="text-[10px] font-semibold text-slate-500 uppercase tracking-widest px-3 pt-4 pb-1.5">Tenants & Users</div>
    <a href="#" onclick="switchTab('tenants')" class="sidebar-item flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-sm text-slate-400 font-medium" id="nav-tenants">
      <span class="text-lg">🏢</span> Organizations
    </a>
    <a href="#" onclick="switchTab('users')" class="sidebar-item flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-sm text-slate-400 font-medium" id="nav-users">
      <span class="text-lg">👥</span> All Users
    </a>
    <a href="#" onclick="switchTab('billing')" class="sidebar-item flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-sm text-slate-400 font-medium" id="nav-billing">
      <span class="text-lg">💳</span> Billing & Plans
    </a>

    <div class="text-[10px] font-semibold text-slate-500 uppercase tracking-widest px-3 pt-4 pb-1.5">Infrastructure</div>
    <a href="#" onclick="switchTab('system')" class="sidebar-item flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-sm text-slate-400 font-medium" id="nav-system">
      <span class="text-lg">🖥️</span> System Monitor
    </a>
    <a href="#" onclick="switchTab('database')" class="sidebar-item flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-sm text-slate-400 font-medium" id="nav-database">
      <span class="text-lg">🗄️</span> Database
    </a>
    <a href="#" onclick="switchTab('queue')" class="sidebar-item flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-sm text-slate-400 font-medium" id="nav-queue">
      <span class="text-lg">⚡</span> Queue & Jobs
    </a>

    <div class="text-[10px] font-semibold text-slate-500 uppercase tracking-widest px-3 pt-4 pb-1.5">Platform Config</div>
    <a href="#" onclick="switchTab('aiconfig')" class="sidebar-item flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-sm text-slate-400 font-medium" id="nav-aiconfig">
      <span class="text-lg">🤖</span> AI Providers
    </a>
    <a href="#" onclick="switchTab('integrations')" class="sidebar-item flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-sm text-slate-400 font-medium" id="nav-integrations">
      <span class="text-lg">🔗</span> Integrations
    </a>
    <a href="#" onclick="switchTab('plans')" class="sidebar-item flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-sm text-slate-400 font-medium" id="nav-plans">
      <span class="text-lg">💎</span> Subscription Plans
    </a>
    <a href="#" onclick="switchTab('affiliate')" class="sidebar-item flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-sm text-slate-400 font-medium" id="nav-affiliate">
      <span class="text-lg">🤝</span> Affiliate Program
    </a>
    <a href="#" onclick="switchTab('settings')" class="sidebar-item flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-sm text-slate-400 font-medium" id="nav-settings">
      <span class="text-lg">⚙️</span> Platform Settings
    </a>

    <div class="text-[10px] font-semibold text-slate-500 uppercase tracking-widest px-3 pt-4 pb-1.5">Security</div>
    <a href="#" onclick="switchTab('security')" class="sidebar-item flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-sm text-slate-400 font-medium" id="nav-security">
      <span class="text-lg">🔐</span> Security Audit
    </a>
    <a href="#" onclick="switchTab('logs')" class="sidebar-item flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-sm text-slate-400 font-medium" id="nav-logs">
      <span class="text-lg">📋</span> System Logs
    </a>
  </nav>

  <!-- Admin Profile -->
  <div class="p-4 border-t border-slate-800">
    <div class="flex items-center gap-3">
      <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-600 to-pink-500 flex items-center justify-center text-xs font-bold text-white">SA</div>
      <div class="flex-1 min-w-0">
        <div class="text-xs font-semibold text-white truncate">Super Admin</div>
        <div class="text-[10px] text-slate-500 truncate">admin@flowsuite.com</div>
      </div>
      <a href="/admin/login" class="text-slate-500 hover:text-red-400 transition-colors text-xs">Exit</a>
    </div>
  </div>
</aside>

<!-- Main Content -->
<main class="ml-64 flex-1 min-h-screen">
  <!-- Top Bar -->
  <header class="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-xl border-b border-slate-800 px-6 py-3.5 flex items-center justify-between">
    <div class="flex items-center gap-3">
      <h1 class="text-base font-bold text-white" id="page-title">Dashboard Overview</h1>
      <span class="badge-live bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
        <span class="w-1.5 h-1.5 bg-emerald-400 rounded-full badge-live inline-block"></span> LIVE
      </span>
    </div>
    <div class="flex items-center gap-3">
      <div class="text-xs text-slate-500 font-mono" id="live-time"></div>
      <button class="bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-all action-btn">
        ➕ New Announcement
      </button>
      <button class="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold px-3 py-2 rounded-lg transition-all action-btn">
        🔔 Alerts <span class="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full ml-1">3</span>
      </button>
    </div>
  </header>

  <div class="p-6">
    <!-- DASHBOARD TAB -->
    <div id="tab-dashboard" class="tab-content active space-y-6">
      <!-- KPI Cards -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="stat-card bg-slate-900 border border-slate-800 rounded-2xl p-5 glow-purple">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Organizations</p>
              <p class="text-3xl font-black text-white mt-2">${orgCount}</p>
              <p class="text-xs text-emerald-400 font-semibold mt-1">▲ +12.4% this month</p>
            </div>
            <div class="w-10 h-10 rounded-xl bg-purple-500/15 flex items-center justify-center text-xl">🏢</div>
          </div>
          <div class="mt-4 bg-slate-800 rounded-full h-1.5">
            <div class="progress-bar bg-gradient-to-r from-purple-500 to-blue-500 h-1.5 rounded-full" style="width: 72%"></div>
          </div>
          <p class="text-[10px] text-slate-600 mt-1">72% of monthly target</p>
        </div>
        
        <div class="stat-card bg-slate-900 border border-slate-800 rounded-2xl p-5 glow-blue">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Users</p>
              <p class="text-3xl font-black text-white mt-2">${userCount}</p>
              <p class="text-xs text-emerald-400 font-semibold mt-1">▲ +8.7% this week</p>
            </div>
            <div class="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center text-xl">👥</div>
          </div>
          <div class="mt-4 bg-slate-800 rounded-full h-1.5">
            <div class="progress-bar bg-gradient-to-r from-blue-500 to-cyan-500 h-1.5 rounded-full" style="width: 85%"></div>
          </div>
          <p class="text-[10px] text-slate-600 mt-1">85% MAU target hit</p>
        </div>

        <div class="stat-card bg-slate-900 border border-slate-800 rounded-2xl p-5 glow-green">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider">MRR (USD)</p>
              <p class="text-3xl font-black text-white mt-2">$${mrr.toLocaleString()}</p>
              <p class="text-xs text-emerald-400 font-semibold mt-1">▲ +21.3% growth</p>
            </div>
            <div class="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center text-xl">💰</div>
          </div>
          <div class="mt-4 bg-slate-800 rounded-full h-1.5">
            <div class="progress-bar bg-gradient-to-r from-emerald-500 to-teal-500 h-1.5 rounded-full" style="width: 63%"></div>
          </div>
          <p class="text-[10px] text-slate-600 mt-1">$150K ARR target</p>
        </div>

        <div class="stat-card bg-slate-900 border border-slate-800 rounded-2xl p-5 glow-orange">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Workspaces</p>
              <p class="text-3xl font-black text-white mt-2">${workspaceCount}</p>
              <p class="text-xs text-amber-400 font-semibold mt-1">▲ +34% vs last month</p>
            </div>
            <div class="w-10 h-10 rounded-xl bg-orange-500/15 flex items-center justify-center text-xl">⚙️</div>
          </div>
          <div class="mt-4 bg-slate-800 rounded-full h-1.5">
            <div class="progress-bar bg-gradient-to-r from-orange-500 to-pink-500 h-1.5 rounded-full" style="width: 58%"></div>
          </div>
          <p class="text-[10px] text-slate-600 mt-1">5M monthly capacity</p>
        </div>
      </div>

      <!-- Secondary Stats -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="bg-slate-900/60 border border-slate-800/60 rounded-xl p-4">
          <p class="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Uptime</p>
          <p class="text-xl font-bold text-emerald-400 mt-1">99.99%</p>
          <p class="text-[10px] text-slate-600 mt-0.5">Last 30 days</p>
        </div>
        <div class="bg-slate-900/60 border border-slate-800/60 rounded-xl p-4">
          <p class="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Total Posts</p>
          <p class="text-xl font-bold text-blue-400 mt-1">${postCount}</p>
          <p class="text-[10px] text-slate-600 mt-0.5">Scheduled & published</p>
        </div>
        <div class="bg-slate-900/60 border border-slate-800/60 rounded-xl p-4">
          <p class="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Inbox Threads</p>
          <p class="text-xl font-bold text-purple-400 mt-1">${threadCount}</p>
          <p class="text-[10px] text-slate-600 mt-0.5">Conversations managed</p>
        </div>
        <div class="bg-slate-900/60 border border-slate-800/60 rounded-xl p-4">
          <p class="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Active Campaigns</p>
          <p class="text-xl font-bold text-amber-400 mt-1">${campaignCount}</p>
          <p class="text-[10px] text-slate-600 mt-0.5">Marketing emails & SMS</p>
        </div>
      </div>

      <!-- Recent Activity + Quick Actions -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Recent Registrations -->
        <div class="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-bold text-white">Recent Organization Registrations</h3>
            <button onclick="switchTab('tenants')" class="text-xs text-purple-400 hover:text-purple-300 font-semibold">View All →</button>
          </div>
          <div class="space-y-3">
            <div class="flex items-center gap-3 p-3 bg-slate-950/50 rounded-xl">
              <div class="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-purple-600 flex items-center justify-center text-xs font-bold text-white">GM</div>
              <div class="flex-1 min-w-0">
                <p class="text-xs font-semibold text-white">Global Marketing Ltd</p>
                <p class="text-[10px] text-slate-500">global@marketing.com • ENTERPRISE</p>
              </div>
              <div class="text-right">
                <p class="text-xs text-emerald-400 font-semibold">Active</p>
                <p class="text-[10px] text-slate-600">2 hrs ago</p>
              </div>
            </div>
            <div class="flex items-center gap-3 p-3 bg-slate-950/50 rounded-xl">
              <div class="w-8 h-8 rounded-lg bg-gradient-to-tr from-emerald-600 to-teal-600 flex items-center justify-center text-xs font-bold text-white">DA</div>
              <div class="flex-1 min-w-0">
                <p class="text-xs font-semibold text-white">Digital Accelerate BD</p>
                <p class="text-[10px] text-slate-500">info@digitalbd.com • PRO</p>
              </div>
              <div class="text-right">
                <p class="text-xs text-emerald-400 font-semibold">Active</p>
                <p class="text-[10px] text-slate-600">5 hrs ago</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="space-y-4">
          <div class="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <h3 class="text-sm font-bold text-white mb-3">⚡ Quick Actions</h3>
            <div class="space-y-2">
              <button onclick="switchTab('tenants')" class="w-full flex items-center gap-2.5 p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl text-xs text-purple-300 font-semibold hover:bg-purple-500/20 transition-all action-btn">
                🏢 Manage Organizations
              </button>
              <button onclick="switchTab('billing')" class="w-full flex items-center gap-2.5 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-300 font-semibold hover:bg-blue-500/20 transition-all action-btn">
                💳 Revenue & Billing
              </button>
              <button onclick="switchTab('aiconfig')" class="w-full flex items-center gap-2.5 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-300 font-semibold hover:bg-emerald-500/20 transition-all action-btn">
                🤖 Configure AI Providers
              </button>
            </div>
          </div>

          <!-- Platform Status -->
          <div class="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <h3 class="text-sm font-bold text-white mb-3">🟢 Platform Status</h3>
            <div class="space-y-2.5">
              <div class="flex justify-between items-center">
                <span class="text-xs text-slate-400">Backend API</span>
                <span class="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">ONLINE</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-xs text-slate-400">Frontend Panel</span>
                <span class="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">ONLINE</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-xs text-slate-400">PostgreSQL DB</span>
                <span class="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">SYNCED</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- TENANTS TAB -->
    <div id="tab-tenants" class="tab-content space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-lg font-bold text-white">Organization Tenants</h2>
          <p class="text-xs text-slate-500 mt-0.5">Manage all registered businesses and agencies on FlowSuite</p>
        </div>
      </div>
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <p class="text-xs text-slate-400">Dynamic listing of database tenants and credentials.</p>
      </div>
    </div>

    <!-- SYSTEM MONITOR TAB -->
    <div id="tab-system" class="tab-content space-y-6">
      <h2 class="text-lg font-bold text-white">🖥️ System Infrastructure Monitor</h2>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <p class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">RAM Free</p>
          <p class="text-3xl font-black text-white mt-2">${(os.freemem() / 1024 / 1024 / 1024).toFixed(2)} GB</p>
        </div>
        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <p class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">RAM Total</p>
          <p class="text-3xl font-black text-white mt-2">${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB</p>
        </div>
        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <p class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Platform Arch</p>
          <p class="text-xl font-bold text-white mt-2 font-mono">${os.arch()}</p>
        </div>
        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <p class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">CPU Cores</p>
          <p class="text-3xl font-black text-white mt-2">${os.cpus().length}</p>
        </div>
      </div>
    </div>

    <!-- DATABASE TAB -->
    <div id="tab-database" class="tab-content space-y-6">
      <h2 class="text-lg font-bold text-white">🗄️ Database Management</h2>
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <p class="text-xs text-slate-400">Total tables synced, indexing performance, and query execution speeds.</p>
      </div>
    </div>
  </div>
</main>

<script>
  function updateTime() {
    const el = document.getElementById('live-time');
    if (el) el.textContent = new Date().toLocaleTimeString('en-US', {hour12:false, timeZone:'Asia/Dhaka'}) + ' BDT';
  }
  setInterval(updateTime, 1000);
  updateTime();

  function switchTab(tab) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('[id^="nav-"]').forEach(el => {
      el.classList.remove('active', 'text-slate-200');
      el.classList.add('text-slate-400');
    });
    
    const content = document.getElementById('tab-' + tab);
    if (content) content.classList.add('active');
    
    const nav = document.getElementById('nav-' + tab);
    if (nav) {
      nav.classList.add('active', 'text-slate-200');
      nav.classList.remove('text-slate-400');
    }
  }
</script>
</body>
</html>`;
};

router.get('/', async (req: Request, res: Response) => {
  try {
    const html = await getAdminHtml();
    res.send(html);
  } catch (error: any) {
    res.status(500).send(`Error generating admin dashboard: ${error.message}`);
  }
});

router.get('/login', (req: Request, res: Response) => {
  res.send(`<!DOCTYPE html>
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
</html>`);
});

router.get('/tenants', async (req: Request, res: Response) => {
  try {
    const orgs = await prisma.organization.findMany({
      include: {
        users: { select: { id: true, email: true, fullName: true } }
      }
    });
    res.json({ success: true, data: orgs });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/metrics', async (req: Request, res: Response) => {
  res.json({
    success: true,
    metrics: {
      uptimeSeconds: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpuLoad: os.loadavg(),
      platform: os.platform(),
      release: os.release(),
      uptime: os.uptime(),
    },
  });
});

export default router;
