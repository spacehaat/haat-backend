import { Router } from 'express';
import { validateBody } from '../../middleware/validate.js';
import { DeviceRegisterSchema, DeviceUnregisterSchema } from './devices.schema.js';
import { registerDevice, unregisterDevice } from './devices.service.js';

export const devicesRouter = Router();

devicesRouter.post('/devices/register', validateBody(DeviceRegisterSchema), async (req, res) => {
  await registerDevice(req.body, req.user!);
  res.json({ ok: true });
});

devicesRouter.post('/devices/unregister', validateBody(DeviceUnregisterSchema), async (req, res) => {
  await unregisterDevice(req.body.token, req.user!);
  res.json({ ok: true });
});
