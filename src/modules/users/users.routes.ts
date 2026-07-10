import { Router } from 'express';
import { validateBody } from '../../middleware/validate.js';
import { requireAuth, requirePermission } from '../auth/auth.middleware.js';
import { PERMISSIONS } from '../auth/permissions.js';
import { UserCreateSchema, UserUpdateSchema } from './users.schema.js';
import { createUser, listUsers, updateUser } from './users.service.js';

export const usersRouter = Router();

// Every user-management route requires an authenticated admin (users:manage).
usersRouter.use('/users', requireAuth, requirePermission(PERMISSIONS.USERS_MANAGE));

usersRouter.get('/users', async (_req, res) => {
  const items = await listUsers();
  res.json({ items });
});

usersRouter.post('/users', validateBody(UserCreateSchema), async (req, res) => {
  const item = await createUser(req.body, req.user!.id);
  res.status(201).json({ item });
});

usersRouter.patch('/users/:id', validateBody(UserUpdateSchema), async (req, res) => {
  const item = await updateUser(String(req.params.id), req.body, req.user!.id);
  res.json({ item });
});
