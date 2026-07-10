import mongoose, { Schema, Types } from 'mongoose';
import { ALL_PERMISSIONS, ROLES } from '../auth/permissions.js';

const UserSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    phone: { type: String, default: '', trim: true },
    gender: { type: String, enum: ['male', 'female', 'other', 'unspecified'], default: 'unspecified' },

    // Never returned to clients; selected explicitly only when verifying a password.
    passwordHash: { type: String, required: true, select: false },

    role: { type: String, enum: ROLES, default: 'member', index: true },
    // Scalable access: fine-grained capability strings.
    permissions: { type: [String], enum: ALL_PERMISSIONS, default: [] },
    // City-scope dimension (members are limited to these cities).
    cities: { type: [String], default: [] },

    status: { type: String, enum: ['active', 'disabled'], default: 'active', index: true },
    lastLoginAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export const User = mongoose.model('User', UserSchema);

export type UserDoc = mongoose.InferSchemaType<typeof UserSchema> & {
  _id: Types.ObjectId;
};

// Shape safe to expose to clients (no passwordHash).
export function toPublicUser(doc: UserDoc) {
  return {
    id: String(doc._id),
    name: doc.name,
    email: doc.email,
    phone: doc.phone || '',
    gender: doc.gender || 'unspecified',
    role: doc.role,
    permissions: doc.permissions || [],
    cities: doc.cities || [],
    status: doc.status || 'active',
    lastLoginAt: doc.lastLoginAt || null,
    createdAt: (doc as unknown as { createdAt?: Date }).createdAt || null,
  };
}
