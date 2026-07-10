import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  MONGODB_URI: z.string().min(1),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Auth / security
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 chars'),
  JWT_EXPIRES_IN: z.string().min(1).default('7d'),
  JWT_ACCESS_EXPIRES_IN: z.string().min(1).default('15m'),
  JWT_REFRESH_EXPIRES_DAYS: z.coerce.number().int().positive().default(30),
  COOKIE_NAME: z.string().min(1).default('spacehaat_token'),
  // Bootstrap admin (created on first boot if no admin exists)
  ADMIN_NAME: z.string().min(1).default('Admin'),
  ADMIN_EMAIL: z.string().email().default('admin@spacehaat.in'),
  ADMIN_PASSWORD: z.string().min(8).default('ChangeMe@12345'),
  ADMIN_PHONE: z.string().default(''),

  AWS_ACCESS_KEY_ID: z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),
  AWS_REGION: z.string().min(1).default('ap-south-1'),
  AWS_S3_BUCKET: z.string().min(1),
  AWS_S3_FOLDER: z.string().min(1).default('inventory'),
  AWS_S3_PUBLIC_URL: z.string().optional(),

  // Optional — enables AI enquiry parsing (falls back to rules engine if unset)
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().min(1).default('gpt-4o-mini'),
});

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse({
  PORT: process.env.PORT,
  MONGODB_URI: process.env.MONGODB_URI,
  CORS_ORIGIN: process.env.CORS_ORIGIN,
  NODE_ENV: process.env.NODE_ENV,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN,
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN,
  JWT_REFRESH_EXPIRES_DAYS: process.env.JWT_REFRESH_EXPIRES_DAYS,
  COOKIE_NAME: process.env.COOKIE_NAME,
  ADMIN_NAME: process.env.ADMIN_NAME,
  ADMIN_EMAIL: process.env.ADMIN_EMAIL,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  ADMIN_PHONE: process.env.ADMIN_PHONE,
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
  AWS_REGION: process.env.AWS_REGION,
  AWS_S3_BUCKET: process.env.AWS_S3_BUCKET,
  AWS_S3_FOLDER: process.env.AWS_S3_FOLDER,
  AWS_S3_PUBLIC_URL: process.env.AWS_S3_PUBLIC_URL,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
});

export const isProd = env.NODE_ENV === 'production';

