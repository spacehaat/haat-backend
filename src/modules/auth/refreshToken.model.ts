import crypto from 'crypto';
import mongoose, { Schema, Types } from 'mongoose';

const RefreshTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true, index: true },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = mongoose.model('RefreshToken', RefreshTokenSchema);

export type RefreshTokenDoc = mongoose.InferSchemaType<typeof RefreshTokenSchema> & {
  _id: Types.ObjectId;
};

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateRefreshTokenValue(): string {
  return crypto.randomBytes(48).toString('base64url');
}
