import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { errorMiddleware } from './middleware/error.js';
import { requireAuth } from './modules/auth/auth.middleware.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { usersRouter } from './modules/users/users.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { listingsRouter } from './modules/listings/listings.routes.js';
import { uploadsRouter } from './modules/uploads/uploads.routes.js';
import { proposalsRouter, publicProposalsRouter } from './modules/proposals/proposals.routes.js';
import { smartMatchRouter } from './modules/smart-match/smart-match.routes.js';
import { dashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { leadsRouter } from './modules/leads/leads.routes.js';
import { devicesRouter } from './modules/devices/devices.routes.js';

export function createApp() {
  const app = express();

  const corsOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);

  app.use(helmet());
  app.use(cors({
    origin: corsOrigins.length <= 1 ? corsOrigins[0] : corsOrigins,
    credentials: true,
  }));
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.use(morgan('dev'));

  app.get('/', (_req, res) => res.json({ ok: true, service: 'spacehaat-backend' }));

  // Public: health + auth (login/logout). /auth/me self-guards.
  app.use('/api/v1', healthRouter);
  app.use('/api/v1', authRouter);
  app.use('/api/v1', publicProposalsRouter);

  // Admin-only user management (router self-guards with requireAuth + permission).
  app.use('/api/v1', usersRouter);

  // Everything below requires a valid session — no data is reachable without
  // authentication. Fine-grained permissions + scoping are enforced per route.
  app.use('/api/v1', requireAuth, listingsRouter);
  app.use('/api/v1', requireAuth, uploadsRouter);
  app.use('/api/v1', requireAuth, proposalsRouter);
  app.use('/api/v1', requireAuth, smartMatchRouter);
  app.use('/api/v1', requireAuth, dashboardRouter);
  app.use('/api/v1', requireAuth, leadsRouter);
  app.use('/api/v1', requireAuth, devicesRouter);

  app.use(errorMiddleware);
  return app;
}

