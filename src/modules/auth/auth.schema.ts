import { z } from 'zod';

export const LoginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
  platform: z.enum(['mobile', 'web']).optional(),
});

export const RefreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export type LoginInput = z.infer<typeof LoginSchema>;
