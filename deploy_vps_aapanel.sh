#!/bin/bash
# ==============================================================================
# FLOWSUITE AAPANEL VPS DEPLOYMENT & AUTO-SYNC SCRIPT
# Server IP: 148.230.98.190
# Backend Domain: flowsuite.amansuite.com (Port 4000)
# Frontend Domain: suite.amanasuite.com (Port 3000)
# ==============================================================================

set -e
export DEBIAN_FRONTEND=noninteractive

echo "🚀 Starting FlowSuite aaPanel VPS Deployment for 148.230.98.190..."

sudo apt-get update -y && sudo apt-get install -y -o Dpkg::Options::="--force-confold" -o Dpkg::Options::="--force-confdef" curl git nginx certbot python3-certbot-nginx postgresql redis-server

if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y -o Dpkg::Options::="--force-confold" nodejs
fi
sudo npm install -g pm2 ts-node typescript prisma --unsafe-perm

mkdir -p /www/wwwroot/flowsuite.amansuite.com
mkdir -p /www/wwwroot/suite.amanasuite.com

echo "📦 Syncing Repositories from mahmudulhassan-dev..."

if [ ! -d "/www/wwwroot/flowsuite.amansuite.com/.git" ]; then
    git clone https://github.com/mahmudulhassan-dev/flowsuite-backend.git /www/wwwroot/flowsuite.amansuite.com
else
    cd /www/wwwroot/flowsuite.amansuite.com
    git pull origin main
fi

cd /www/wwwroot/flowsuite.amansuite.com
npm install
npm run build || tsc

if [ ! -d "/www/wwwroot/suite.amanasuite.com/.git" ]; then
    git clone https://github.com/mahmudulhassan-dev/flowsuite-frontend.git /www/wwwroot/suite.amanasuite.com
else
    cd /www/wwwroot/suite.amanasuite.com
    git pull origin main
fi

cd /www/wwwroot/suite.amanasuite.com
npm install
npm run build

echo "⚡ Launching PM2 Server Instances..."
cd /www/wwwroot/flowsuite.amansuite.com
pm2 start dist/server.js --name "flowsuite-backend" || pm2 restart "flowsuite-backend"

cd /www/wwwroot/suite.amanasuite.com
pm2 start npm --name "flowsuite-frontend" -- start || pm2 restart "flowsuite-frontend"

pm2 save

echo "🌐 Configuring aaPanel Nginx Site Blocks..."

cat << 'EOF' > /www/server/panel/vhost/nginx/flowsuite.amansuite.com.conf
server {
    listen 80;
    server_name flowsuite.amansuite.com;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

cat << 'EOF' > /www/server/panel/vhost/nginx/suite.amanasuite.com.conf
server {
    listen 80;
    server_name suite.amanasuite.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

sudo nginx -t && sudo nginx -s reload

echo "🔒 Activating Let's Encrypt SSL Certificates..."
sudo certbot --nginx -d flowsuite.amansuite.com -d suite.amanasuite.com --non-interactive --agree-tos -m admin@amansuite.com || true

echo "✅ FlowSuite aaPanel VPS Deployment Completed Successfully!"
