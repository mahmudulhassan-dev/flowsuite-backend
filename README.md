# FlowSuite Backend & SuperAdmin Gateway (`flowsuite.amanasuite.com`)

## 📌 Architecture & Overview
The **FlowSuite Backend** is a modular Node.js Express API Engine written in **100% Strict TypeScript**. It powers the **SuperAdmin Control Gateway**, **Multi-Tenant Workspace Management**, **PostgreSQL Database ORM (Prisma)**, **Redis Queue Workers**, and **Authentication APIs**.

- **Production Port**: `4006`
- **Domain**: `https://flowsuite.amanasuite.com`
- **SuperAdmin Dashboard**: `https://flowsuite.amanasuite.com/admin`
- **GitHub Repository**: `https://github.com/mahmudulhassan-dev/flowsuite-backend.git`

---

## 🚀 Local Development Setup
```bash
# Navigate to the backend directory
cd backend

# Install Node dependencies
npm install

# Push Prisma DDL schema to PostgreSQL
npx prisma db push

# Run the local Express API dev server
npm run dev
```

---

## 🔑 Environment Configuration (`.env`)
```env
PORT=4006
NODE_ENV=production
DATABASE_URL="postgresql://postgres@127.0.0.1:5432/flowsuite_db?schema=public"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="flowsuite-secret-key-2026"
BACKEND_DOMAIN="https://flowsuite.amanasuite.com"
FRONTEND_DOMAIN="https://suite.amanasuite.com"
```

---

## 🔄 Automated VPS Deployment Pipeline (No SFTP)
1. Local edits & compilation verification (`npm run build`).
2. Commit and push to GitHub: `git push origin main`.
3. On VPS Server (`148.230.98.190`):
   ```bash
   cd /www/wwwroot/flowsuite.amansuite.com
   git pull origin main
   npm install
   npx prisma db push
   npm run build
   pm2 restart flowsuite-backend
   ```

---

## 📡 SuperAdmin API System Routes
- `GET /admin`: SuperAdmin Control Gateway Dashboard
- `GET /admin/login`: SuperAdmin Login Portal
- `GET /admin/tenants`: List All Multi-Tenant Workspaces
- `GET /admin/metrics`: Server Memory, CPU & Database Load Metrics
