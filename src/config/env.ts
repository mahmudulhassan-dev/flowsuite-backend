import dotenv from 'dotenv';
dotenv.config();

export const ENV = {
  PORT: process.env.PORT || 4006,
  NODE_ENV: process.env.NODE_ENV || 'production',
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://flowsuite_user:FlowSuitePass2026!@localhost:5432/flowsuite_db?schema=public',
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  JWT_SECRET: process.env.JWT_SECRET || 'flowsuite-secret-key-change-in-production',
  BACKEND_DOMAIN: process.env.BACKEND_DOMAIN || 'https://flowsuite.amanasuite.com',
  FRONTEND_DOMAIN: process.env.FRONTEND_DOMAIN || 'https://suite.amanasuite.com',
  S3_BUCKET: process.env.S3_BUCKET || 'flowsuite-media-assets',
  S3_REGION: process.env.S3_REGION || 'us-east-1',

  // SuperAdmin panel credentials (no default password — panel stays locked until set)
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@flowsuite.com',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',
  ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH || '',

  // Extra browser origins allowed to call the API (comma-separated)
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || '',

  // Social login verification
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
};
