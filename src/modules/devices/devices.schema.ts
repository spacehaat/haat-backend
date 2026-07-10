import { z } from 'zod';

export const DeviceRegisterSchema = z.object({
  token: z.string().min(1, 'Push token is required'),
  platform: z.enum(['ios', 'android', 'web']).optional().default('ios'),
});

export const DeviceUnregisterSchema = z.object({
  token: z.string().min(1, 'Push token is required'),
});

export type DeviceRegisterInput = z.infer<typeof DeviceRegisterSchema>;
