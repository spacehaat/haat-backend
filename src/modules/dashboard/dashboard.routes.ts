import { Router } from 'express';
import { getDashboardStats } from './dashboard.service.js';

export const dashboardRouter = Router();

// Scoped by city for members; full inventory for admins (see dashboard.service).
dashboardRouter.get('/dashboard/stats', async (req, res) => {
  const stats = await getDashboardStats(req.user!);
  res.json({ stats });
});
