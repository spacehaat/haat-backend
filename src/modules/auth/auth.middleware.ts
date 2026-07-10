import type { RequestHandler } from 'express';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/apiError.js';
import { authenticateToken } from './auth.service.js';
import { hasPermission, type Permission, type Role } from './permissions.js';

function readAuthToken(req: { cookies?: Record<string, string>; headers?: { authorization?: string } }) {
  const bearer = req.headers?.authorization;
  if (bearer?.startsWith('Bearer ')) {
    return bearer.slice(7).trim();
  }
  return req.cookies?.[env.COOKIE_NAME] as string | undefined;
}

// Verifies cookie or Bearer token and attaches the fresh user to req.user.
export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const token = readAuthToken(req);
    const user = await authenticateToken(token);
    if (!user) {
      throw new ApiError(401, 'Authentication required', 'UNAUTHENTICATED');
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

export function requireRole(role: Role): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(new ApiError(401, 'Authentication required', 'UNAUTHENTICATED'));
    if (req.user.role !== role) {
      return next(new ApiError(403, 'You do not have access to this resource', 'FORBIDDEN'));
    }
    next();
  };
}

export function requirePermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(new ApiError(401, 'Authentication required', 'UNAUTHENTICATED'));
    if (!hasPermission(req.user, permission)) {
      return next(new ApiError(403, 'You do not have access to this resource', 'FORBIDDEN'));
    }
    next();
  };
}
