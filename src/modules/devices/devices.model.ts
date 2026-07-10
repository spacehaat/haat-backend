import mongoose, { Schema, Types } from 'mongoose';

const DeviceSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    token: { type: String, required: true, unique: true, index: true },
    platform: { type: String, enum: ['ios', 'android', 'web'], default: 'ios' },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export const Device = mongoose.model('Device', DeviceSchema);

export type DeviceDoc = mongoose.InferSchemaType<typeof DeviceSchema> & {
  _id: Types.ObjectId;
};
