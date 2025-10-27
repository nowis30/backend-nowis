import { Router } from 'express';

import { authenticated, AuthenticatedRequest } from '../middlewares/authenticated';
import { getProfileBootstrap } from '../services/profileService';
import { getProfileSummary } from '../services/profileSummaryService';
import { getProfileInsights } from '../services/profileInsightsService';
import { getProfileDashboard } from '../services/profileDashboardService';

const profileRouter = Router();

profileRouter.use(authenticated);

profileRouter.get('/bootstrap', async (req: AuthenticatedRequest, res, next) => {
  try {
    const payload = await getProfileBootstrap(req.userId!);
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

profileRouter.get('/summary', async (req: AuthenticatedRequest, res, next) => {
  try {
    const payload = await getProfileSummary(req.userId!);
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

profileRouter.get('/insights', async (req: AuthenticatedRequest, res, next) => {
  try {
    const payload = await getProfileInsights(req.userId!);
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

profileRouter.get('/dashboard', async (req: AuthenticatedRequest, res, next) => {
  try {
    const payload = await getProfileDashboard(req.userId!);
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

export { profileRouter };
