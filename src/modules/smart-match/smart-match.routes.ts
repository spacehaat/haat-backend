import { Router } from 'express';
import { validateBody } from '../../middleware/validate.js';
import { requirePermission } from '../auth/auth.middleware.js';
import { PERMISSIONS } from '../auth/permissions.js';
import { SmartMatchParseSchema, SmartMatchRunSchema } from './smart-match.schema.js';
import { parseEnquiry, runSmartMatch } from './smart-match.service.js';

export const smartMatchRouter = Router();

smartMatchRouter.post(
  '/smart-match/parse',
  requirePermission(PERMISSIONS.LISTINGS_READ),
  validateBody(SmartMatchParseSchema),
  async (req, res) => {
    const result = await parseEnquiry(req.body.enquiry, req.user!);
    res.json(result);
  },
);

smartMatchRouter.post(
  '/smart-match',
  requirePermission(PERMISSIONS.LISTINGS_READ),
  validateBody(SmartMatchRunSchema),
  async (req, res) => {
    const result = await runSmartMatch(req.body, req.user!);
    res.json(result);
  },
);
