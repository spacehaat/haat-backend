import { Router } from 'express';
import { validateBody } from '../../middleware/validate.js';
import { requirePermission } from '../auth/auth.middleware.js';
import { PERMISSIONS } from '../auth/permissions.js';
import {
  countProposalsSentToday,
  generateDraftPdf,
  getOrCreateDraft,
  getOrCreateProposalShareLink,
  getProposalPdfBuffer,
  getPublicProposal,
  getPublicProposalPdfBuffer,
  getStoredProposal,
  listProposals,
  listRecentActivity,
  loadStoredProposalToDraft,
  markProposalFeedbackSeen,
  sendDraft,
  updatePublicProposalFeedback,
  updateDraft,
} from './proposals.service.js';
import {
  ProposalDraftUpdateSchema,
  ProposalPdfSchema,
  ProposalSendSchema,
  PublicProposalFeedbackSchema,
} from './proposals.schema.js';

export const proposalsRouter = Router();
export const publicProposalsRouter = Router();

publicProposalsRouter.get('/public/proposals/:token', async (req, res) => {
  const result = await getPublicProposal(String(req.params.token));
  res.json(result);
});

publicProposalsRouter.patch(
  '/public/proposals/:token',
  validateBody(PublicProposalFeedbackSchema),
  async (req, res) => {
    const result = await updatePublicProposalFeedback(String(req.params.token), req.body);
    res.json(result);
  },
);

publicProposalsRouter.get('/public/proposals/:token/pdf', async (req, res) => {
  const buffer = await getPublicProposalPdfBuffer(String(req.params.token));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="proposal.pdf"');
  res.send(buffer);
});

proposalsRouter.get('/proposals', requirePermission(PERMISSIONS.PROPOSALS_READ), async (req, res) => {
  const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 15;
  const page = typeof req.query.page === 'string' ? Number(req.query.page) : 1;
  const search = typeof req.query.search === 'string' ? req.query.search : '';
  const result = await listProposals(req.user!, {
    page: Number.isFinite(page) ? page : 1,
    limit: Number.isFinite(limit) ? limit : 15,
    search,
  });
  res.json(result);
});

proposalsRouter.get('/proposals/draft', requirePermission(PERMISSIONS.PROPOSALS_READ), async (req, res) => {
  const [draft, proposalsSentToday] = await Promise.all([
    getOrCreateDraft(req.user!.id),
    countProposalsSentToday(req.user!),
  ]);
  res.json({ draft, stats: { proposalsSentToday } });
});

proposalsRouter.patch(
  '/proposals/draft',
  requirePermission(PERMISSIONS.PROPOSALS_WRITE),
  validateBody(ProposalDraftUpdateSchema),
  async (req, res) => {
    const draft = await updateDraft(req.body, req.user!.id);
    res.json({ draft });
  },
);

proposalsRouter.post(
  '/proposals/draft/send',
  requirePermission(PERMISSIONS.PROPOSALS_WRITE),
  validateBody(ProposalSendSchema),
  async (req, res) => {
    const result = await sendDraft(req.body, req.user!);
    res.json(result);
  },
);

proposalsRouter.post(
  '/proposals/draft/pdf',
  requirePermission(PERMISSIONS.PROPOSALS_WRITE),
  validateBody(ProposalPdfSchema),
  async (req, res) => {
    const result = await generateDraftPdf(
      req.user!,
      req.body.render,
      req.body.title,
      req.body.updateProposalId,
      req.body.leadId,
    );
    res.json(result);
  },
);

proposalsRouter.get('/proposals/:id/pdf', requirePermission(PERMISSIONS.PROPOSALS_READ), async (req, res) => {
  const buffer = await getProposalPdfBuffer(String(req.params.id), req.user!);
  const filename = 'proposal.pdf';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.send(buffer);
});

proposalsRouter.post('/proposals/:id/share-link', requirePermission(PERMISSIONS.PROPOSALS_READ), async (req, res) => {
  const result = await getOrCreateProposalShareLink(String(req.params.id), req.user!);
  res.json(result);
});

proposalsRouter.get('/proposals/:id', requirePermission(PERMISSIONS.PROPOSALS_READ), async (req, res) => {
  const item = await getStoredProposal(String(req.params.id), req.user!);
  res.json({ item });
});

proposalsRouter.post(
  '/proposals/:id/feedback/seen',
  requirePermission(PERMISSIONS.PROPOSALS_READ),
  async (req, res) => {
    const result = await markProposalFeedbackSeen(String(req.params.id), req.user!);
    res.json(result);
  },
);

proposalsRouter.post(
  '/proposals/:id/load-draft',
  requirePermission(PERMISSIONS.PROPOSALS_WRITE),
  async (req, res) => {
    const result = await loadStoredProposalToDraft(String(req.params.id), req.user!);
    res.json(result);
  },
);

proposalsRouter.get('/activity', async (req, res) => {
  const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 20;
  const items = await listRecentActivity(Number.isFinite(limit) ? limit : 20);
  res.json({ items });
});
