import { z } from 'zod';
import { ALL_PERMISSIONS } from '../auth/permissions.js';

const permissionsArray = z
  .array(z.string())
  .default([])
  .refine((arr) => arr.every((p) => (ALL_PERMISSIONS as string[]).includes(p)), {
    message: 'Contains an unknown permission',
  });

const genderEnum = z.enum(['male', 'female', 'other', 'unspecified']);
const roleEnum = z.enum(['admin', 'member']);

export const UserCreateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(120),
  email: z.string().email('Enter a valid email'),
  phone: z.string().max(20).optional().default(''),
  gender: genderEnum.optional().default('unspecified'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  role: roleEnum.optional().default('member'),
  permissions: permissionsArray,
  cities: z.array(z.string()).default([]),
});

export const UserUpdateSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    phone: z.string().max(20).optional(),
    gender: genderEnum.optional(),
    password: z.string().min(8, 'Password must be at least 8 characters').max(128).optional(),
    role: roleEnum.optional(),
    permissions: z.array(z.string()).refine(
      (arr) => arr.every((p) => (ALL_PERMISSIONS as string[]).includes(p)),
      { message: 'Contains an unknown permission' },
    ).optional(),
    cities: z.array(z.string()).optional(),
    status: z.enum(['active', 'disabled']).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' });

export type UserCreateInput = z.infer<typeof UserCreateSchema>;
export type UserUpdateInput = z.infer<typeof UserUpdateSchema>;
