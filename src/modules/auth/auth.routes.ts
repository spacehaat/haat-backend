import { Router } from 'express';
import { env, isProd } from '../../config/env.js';
import { validateBody } from '../../middleware/validate.js';
import { ALL_PERMISSIONS } from './permissions.js';
import { LoginSchema, RefreshSchema } from './auth.schema.js';
import { requireAuth } from './auth.middleware.js';
import {
  getPublicUserById,
  login,
  refreshMobileSession,
  revokeRefreshToken,
} from './auth.service.js';

export const authRouter = Router();

const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // mirrors default JWT_EXPIRES_IN (7d)

function cookieOptions() {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: COOKIE_MAX_AGE_MS,
  };
}

function wantsMobileTokens(req: { body?: { platform?: string }; query?: { platform?: string }; get(name: string): string | undefined }) {
  return req.body?.platform === 'mobile'
    || req.query?.platform === 'mobile'
    || req.get('x-platform') === 'mobile';
}

authRouter.post('/auth/login', validateBody(LoginSchema), async (req, res) => {
  const mobile = wantsMobileTokens(req);

  if (mobile) {
    const { user, accessToken, refreshToken } = await login(req.body.email, req.body.password, { mobile: true });
    res.json({ user, accessToken, refreshToken });
    return;
  }

  const { token, user } = await login(req.body.email, req.body.password);
  res.cookie(env.COOKIE_NAME, token, cookieOptions());
  res.json({ user });
});

authRouter.post('/auth/refresh', validateBody(RefreshSchema), async (req, res) => {
  const { accessToken, refreshToken, user } = await refreshMobileSession(req.body.refreshToken);
  res.json({ accessToken, refreshToken, user });
});

authRouter.post('/auth/logout', async (req, res) => {
  const refreshToken = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : '';
  if (refreshToken) {
    await revokeRefreshToken(refreshToken);
  }
  res.clearCookie(env.COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
  res.json({ ok: true });
});

authRouter.get('/auth/me', requireAuth, async (req, res) => {
  const user = await getPublicUserById(req.user!.id);
  res.json({ user, catalog: { permissions: ALL_PERMISSIONS } });
});
