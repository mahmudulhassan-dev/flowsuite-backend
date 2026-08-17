import dotenv from 'dotenv';
dotenv.config();

export const ENV = {
  PORT: process.env.PORT || 4000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/flowsuite',
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  JWT_SECRET: process.env.JWT_SECRET || 'flowsuite-secret-key-change-in-production',
  S3_BUCKET: process.env.S3_BUCKET || 'flowsuite-media-assets',
  S3_REGION: process.env.S3_REGION || 'us-east-1',
};
