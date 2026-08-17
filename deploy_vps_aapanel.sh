#!/bin/bash
# ==============================================================================
# FLOWSUITE AAPANEL VPS DEPLOYMENT & AUTO-SYNC SCRIPT
# Server IP: 148.230.98.190
# Backend Domain: flowsuite.amansuite.com (Port 4006)
# Frontend Domain: suite.amanasuite.com (Port 4005)
# ==============================================================================

set -e
export DEBIAN_FRONTEND=noninteractive

echo "Starting FlowSuite aaPanel VPS Deployment for 148.230.98.190..."

sudo apt-get update -y && sudo apt-get install -y -o Dpkg::Options::="--force-confold" -o Dpkg::Options::="--force-confdef" curl git nginx certbot python3-certbot-nginx postgresql redis-server

# 1. Setup aaPanel PostgreSQL Database flowsuite_db
sudo -u postgres psql -c "CREATE USER flowsuite_user WITH PASSWORD 'FlowSuitePass2026!';" || true
sudo -u postgres psql -c "CREATE DATABASE flowsuite_db OWNER flowsuite_user;" || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE flowsuite_db TO flowsuite_user;" || true

if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y -o Dpkg::Options::="--force-confold" nodejs
fi

if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2 ts-node typescript prisma --force || true
fi

mkdir -p /www/wwwroot/flowsuite.amansuite.com
mkdir -p /www/wwwroot/suite.amanasuite.com

echo "Syncing Repositories from mahmudulhassan-dev..."

if [ ! -d "/www/wwwroot/flowsuite.amansuite.com/.git" ]; then
    git clone https://github.com/mahmudulhassan-dev/flowsuite-backend.git /www/wwwroot/flowsuite.amansuite.com || true
else
    cd /www/wwwroot/flowsuite.amansuite.com
    git pull origin main || true
fi

cd /www/wwwroot/flowsuite.amansuite.com
npm install
npx prisma db push || true
npm run build || npx tsc

if [ ! -d "/www/wwwroot/suite.amanasuite.com/.git" ]; then
    git clone https://github.com/mahmudulhassan-dev/flowsuite-frontend.git /www/wwwroot/suite.amanasuite.com || true
else
    cd /www/wwwroot/suite.amanasuite.com
    git pull origin main || true
fi

cd /www/wwwroot/suite.amanasuite.com
npm install
npm run build

echo "Launching PM2 Server Instances on Ports 4006 & 4005..."
cd /www/wwwroot/flowsuite.amansuite.com
pm2 start dist/server.js --name "flowsuite-backend" || pm2 restart "flowsuite-backend" || true

cd /www/wwwroot/suite.amanasuite.com
pm2 start npm --name "flowsuite-frontend" -- start || pm2 restart "flowsuite-frontend" || true

pm2 save || true

echo "Configuring aaPanel Nginx Site Blocks..."

cat << 'EOF' > /www/server/panel/vhost/nginx/flowsuite.amansuite.com.conf
server {
    listen 80;
    server_name flowsuite.amansuite.com;

    location / {
        proxy_pass http://127.0.0.1:4006;
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
        proxy_pass http://127.0.0.1:4005;
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

# Link to sites-enabled
ln -sf /www/server/panel/vhost/nginx/flowsuite.amansuite.com.conf /etc/nginx/sites-enabled/flowsuite.amansuite.com.conf
ln -sf /www/server/panel/vhost/nginx/suite.amanasuite.com.conf /etc/nginx/sites-enabled/suite.amanasuite.com.conf

sudo /etc/init.d/nginx reload || sudo systemctl reload nginx || true

echo "FlowSuite aaPanel VPS Deployment Completed Successfully!"
