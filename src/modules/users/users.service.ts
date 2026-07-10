import { ApiError } from '../../utils/apiError.js';
import { hashPassword } from '../auth/auth.service.js';
import type { Permission } from '../auth/permissions.js';
import { User, toPublicUser, type UserDoc } from './users.model.js';
import type { UserCreateInput, UserUpdateInput } from './users.schema.js';

export async function listUsers() {
  const docs = await User.find().sort({ createdAt: -1 }).exec();
  return docs.map((d) => toPublicUser(d as unknown as UserDoc));
}

export async function createUser(input: UserCreateInput, createdById: string) {
  const email = input.email.toLowerCase().trim();
  const existing = await User.exists({ email });
  if (existing) {
    throw new ApiError(409, 'A user with this email already exists', 'EMAIL_TAKEN');
  }

  const passwordHash = await hashPassword(input.password);
  // Admins implicitly hold every permission, so we don't persist a list for them.
  const permissions = input.role === 'admin' ? [] : input.permissions;
  const cities = input.role === 'admin' ? [] : input.cities;

  const doc = await User.create({
    name: input.name.trim(),
    email,
    phone: input.phone || '',
    gender: input.gender || 'unspecified',
    passwordHash,
    role: input.role || 'member',
    permissions,
    cities,
    status: 'active',
    createdBy: createdById,
  });

  return toPublicUser(doc as unknown as UserDoc);
}

export async function updateUser(id: string, input: UserUpdateInput, actingUserId: string) {
  const doc = await User.findById(id).exec();
  if (!doc) throw new ApiError(404, 'User not found', 'NOT_FOUND');

  const isSelf = String(doc._id) === actingUserId;

  // Guard rails: an admin cannot lock themselves out.
  if (isSelf && input.status === 'disabled') {
    throw new ApiError(400, 'You cannot disable your own account', 'INVALID_OPERATION');
  }
  if (isSelf && input.role && input.role !== 'admin' && doc.role === 'admin') {
    throw new ApiError(400, 'You cannot remove your own admin role', 'INVALID_OPERATION');
  }

  // Prevent demoting/disabling the last remaining active admin.
  if (doc.role === 'admin' && (input.role === 'member' || input.status === 'disabled')) {
    const otherAdmins = await User.countDocuments({
      _id: { $ne: doc._id },
      role: 'admin',
      status: 'active',
    });
    if (otherAdmins === 0) {
      throw new ApiError(400, 'At least one active admin is required', 'LAST_ADMIN');
    }
  }

  if (input.name !== undefined) doc.name = input.name.trim();
  if (input.phone !== undefined) doc.phone = input.phone;
  if (input.gender !== undefined) doc.gender = input.gender;
  if (input.role !== undefined) doc.role = input.role;
  if (input.status !== undefined) doc.status = input.status;

  const effectiveRole = input.role ?? doc.role;
  if (effectiveRole === 'admin') {
    doc.permissions = [];
    doc.cities = [];
  } else {
    if (input.permissions !== undefined) doc.permissions = input.permissions as Permission[];
    if (input.cities !== undefined) doc.cities = input.cities;
  }

  if (input.password) {
    doc.set('passwordHash', await hashPassword(input.password));
  }

  await doc.save();
  return toPublicUser(doc as unknown as UserDoc);
}
