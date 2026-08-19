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
};
