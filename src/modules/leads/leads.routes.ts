import { Router } from 'express';
import { validateBody } from '../../middleware/validate.js';
import { requirePermission, requireRole } from '../auth/auth.middleware.js';
import { PERMISSIONS } from '../auth/permissions.js';
import {
  LeadCreateSchema,
  LeadFromMatchSchema,
  LeadNoteSchema,
  LeadParseSchema,
  LeadReminderSchema,
  LeadUpdateSchema,
} from './leads.schema.js';
import {
  addLeadNote,
  createLead,
  createLeadFromMatch,
  deleteLead,
  getLead,
  listClients,
  listLeads,
  listRecentClients,
  parseLeadPaste,
  getLeadAssignees,
  setLeadReminder,
  updateLead,
} from './leads.service.js';

export const leadsRouter = Router();

leadsRouter.get('/leads', requirePermission(PERMISSIONS.LEADS_READ), async (req, res) => {
  const page = typeof req.query.page === 'string' ? Number(req.query.page) : 1;
  const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 20;
  const search = typeof req.query.search === 'string' ? req.query.search : '';
  const stage = typeof req.query.stage === 'string'
    ? req.query.stage
    : typeof req.query.status === 'string'
      ? req.query.status
      : undefined;
  const assignee = typeof req.query.assignee === 'string' ? req.query.assignee : undefined;
  const city = typeof req.query.city === 'string' ? req.query.city : undefined;
  const source = typeof req.query.source === 'string' ? req.query.source : undefined;
  const dateFrom = typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined;
  const dateTo = typeof req.query.dateTo === 'string' ? req.query.dateTo : undefined;

  const result = await listLeads(req.user!, {
    page: Number.isFinite(page) ? page : 1,
    limit: Number.isFinite(limit) ? limit : 20,
    search,
    stage,
    assignee,
    city,
    source,
    dateFrom,
    dateTo,
  });
  res.json(result);
});

leadsRouter.post('/leads', requirePermission(PERMISSIONS.LEADS_WRITE), validateBody(LeadCreateSchema), async (req, res) => {
  const lead = await createLead(req.body, req.user!);
  res.status(201).json({ item: lead });
});

leadsRouter.post(
  '/leads/from-match',
  requirePermission(PERMISSIONS.LEADS_WRITE),
  validateBody(LeadFromMatchSchema),
  async (req, res) => {
    const lead = await createLeadFromMatch(req.body, req.user!);
    res.status(201).json({ item: lead });
  },
);

leadsRouter.post(
  '/leads/parse',
  requirePermission(PERMISSIONS.LEADS_WRITE),
  validateBody(LeadParseSchema),
  async (req, res) => {
    const result = await parseLeadPaste(req.body.enquiry, req.user!);
    res.json(result);
  },
);

leadsRouter.get('/leads/assignees', requirePermission(PERMISSIONS.LEADS_READ), async (req, res) => {
  const city = typeof req.query.city === 'string' ? req.query.city : '';
  const result = await getLeadAssignees(city, req.user!);
  res.json(result);
});

leadsRouter.get('/leads/:id', requirePermission(PERMISSIONS.LEADS_READ), async (req, res) => {
  const item = await getLead(String(req.params.id), req.user!);
  res.json({ item });
});

leadsRouter.patch(
  '/leads/:id',
  requirePermission(PERMISSIONS.LEADS_WRITE),
  validateBody(LeadUpdateSchema),
  async (req, res) => {
    const item = await updateLead(String(req.params.id), req.body, req.user!);
    res.json({ item });
  },
);

leadsRouter.delete('/leads/:id', requireRole('admin'), async (req, res) => {
  const result = await deleteLead(String(req.params.id), req.user!);
  res.json(result);
});

leadsRouter.post(
  '/leads/:id/reminder',
  requirePermission(PERMISSIONS.LEADS_WRITE),
  validateBody(LeadReminderSchema),
  async (req, res) => {
    const item = await setLeadReminder(String(req.params.id), req.body, req.user!);
    res.json({ item });
  },
);

leadsRouter.post(
  '/leads/:id/notes',
  requirePermission(PERMISSIONS.LEADS_WRITE),
  validateBody(LeadNoteSchema),
  async (req, res) => {
    const item = await addLeadNote(String(req.params.id), req.body.text, req.user!);
    res.json({ item });
  },
);

leadsRouter.get('/clients', requirePermission(PERMISSIONS.LEADS_READ), async (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search : '';
  const items = await listClients(req.user!, search);
  res.json({ items });
});

leadsRouter.get('/clients/recent', requirePermission(PERMISSIONS.LEADS_READ), async (_req, res) => {
  const items = await listRecentClients(_req.user!);
  res.json({ items });
});
