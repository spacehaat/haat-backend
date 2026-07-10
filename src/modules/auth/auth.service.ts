import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/apiError.js';
import { User, toPublicUser, type UserDoc } from '../users/users.model.js';
import {
  RefreshToken,
  generateRefreshTokenValue,
  hashRefreshToken,
} from './refreshToken.model.js';
import type { AuthUser, Role } from './permissions.js';

const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signToken(userId: string, role: Role, expiresIn = env.JWT_EXPIRES_IN): string {
  return jwt.sign({ sub: userId, role }, env.JWT_SECRET, {
    expiresIn,
  } as jwt.SignOptions);
}

export function signAccessToken(userId: string, role: Role): string {
  return signToken(userId, role, env.JWT_ACCESS_EXPIRES_IN);
}

function verifyToken(token: string): { sub: string } | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    if (typeof payload === 'object' && payload && typeof payload.sub === 'string') {
      return { sub: payload.sub };
    }
    return null;
  } catch {
    return null;
  }
}

function toAuthUser(doc: UserDoc): AuthUser {
  return {
    id: String(doc._id),
    name: doc.name,
    email: doc.email,
    role: doc.role as Role,
    permissions: doc.permissions || [],
    cities: doc.cities || [],
  };
}

function refreshExpiryDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + env.JWT_REFRESH_EXPIRES_DAYS);
  return d;
}

async function issueRefreshToken(userId: string): Promise<string> {
  const value = generateRefreshTokenValue();
  await RefreshToken.create({
    userId,
    tokenHash: hashRefreshToken(value),
    expiresAt: refreshExpiryDate(),
  });
  return value;
}

export async function revokeRefreshToken(token: string): Promise<void> {
  const tokenHash = hashRefreshToken(token);
  await RefreshToken.updateOne(
    { tokenHash, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  ).exec();
}

export async function revokeAllRefreshTokens(userId: string): Promise<void> {
  await RefreshToken.updateMany(
    { userId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  ).exec();
}

// Loads a fresh, active user for the given id — so role/permission/city/status
// changes take effect immediately (no stale token claims).
export async function getActiveAuthUser(userId: string): Promise<AuthUser | null> {
  const doc = await User.findById(userId).exec();
  if (!doc || doc.status !== 'active') return null;
  return toAuthUser(doc as unknown as UserDoc);
}

export async function authenticateToken(token: string | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;
  return getActiveAuthUser(payload.sub);
}

export async function login(
  email: string,
  password: string,
  options: { mobile?: boolean } = {},
) {
  // Use a generic message for both unknown email and wrong password to avoid
  // user enumeration.
  const generic = new ApiError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');

  const doc = await User.findOne({ email: email.toLowerCase().trim() })
    .select('+passwordHash')
    .exec();
  if (!doc) throw generic;
  if (doc.status !== 'active') {
    throw new ApiError(403, 'This account has been disabled', 'ACCOUNT_DISABLED');
  }

  const ok = await verifyPassword(password, doc.passwordHash);
  if (!ok) throw generic;

  doc.lastLoginAt = new Date();
  await doc.save();

  const userId = String(doc._id);
  const role = doc.role as Role;
  const user = toPublicUser(doc as unknown as UserDoc);

  if (options.mobile) {
    const accessToken = signAccessToken(userId, role);
    const refreshToken = await issueRefreshToken(userId);
    return { user, accessToken, refreshToken };
  }

  const token = signToken(userId, role);
  return { token, user };
}

export async function refreshMobileSession(refreshToken: string) {
  const tokenHash = hashRefreshToken(refreshToken);
  const session = await RefreshToken.findOne({ tokenHash }).exec();

  if (!session || session.revokedAt || session.expiresAt <= new Date()) {
    throw new ApiError(401, 'Refresh token is invalid or expired', 'INVALID_REFRESH_TOKEN');
  }

  const user = await getActiveAuthUser(String(session.userId));
  if (!user) {
    throw new ApiError(401, 'User is no longer active', 'UNAUTHENTICATED');
  }

  session.revokedAt = new Date();
  await session.save();

  const accessToken = signAccessToken(user.id, user.role);
  const nextRefreshToken = await issueRefreshToken(user.id);

  return { accessToken, refreshToken: nextRefreshToken, user: await getPublicUserById(user.id) };
}

export async function getPublicUserById(userId: string) {
  const doc = await User.findById(userId).exec();
  if (!doc) return null;
  return toPublicUser(doc as unknown as UserDoc);
}

// Creates the bootstrap admin from env on first boot when no admin exists yet.
export async function ensureBootstrapAdmin() {
  const adminExists = await User.exists({ role: 'admin' });
  if (adminExists) return;

  const email = env.ADMIN_EMAIL.toLowerCase().trim();
  const existing = await User.findOne({ email }).exec();
  if (existing) {
    existing.role = 'admin';
    existing.status = 'active';
    await existing.save();
    // eslint-disable-next-line no-console
    console.log(`[auth] promoted existing user ${email} to admin`);
    return;
  }

  const passwordHash = await hashPassword(env.ADMIN_PASSWORD);
  await User.create({
    name: env.ADMIN_NAME,
    email,
    phone: env.ADMIN_PHONE,
    gender: 'unspecified',
    passwordHash,
    role: 'admin',
    permissions: [],
    cities: [],
    status: 'active',
  });
  // eslint-disable-next-line no-console
  console.log(`[auth] bootstrap admin created: ${email}`);
}
