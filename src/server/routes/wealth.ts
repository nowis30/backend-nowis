import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';

import { authenticated, type AuthenticatedRequest } from '../middlewares/authenticated';
import {
  buildFamilyWealthOverview,
  buildFamilyWealthHistory,
  runFamilyWealthScenario,
  runFamilyWealthStressTest,
  listFamilyWealthScenarios,
  deleteFamilyWealthScenario
} from '../services/wealth/familyWealthService';

const wealthRouter = Router();

wealthRouter.use(authenticated);

const overviewQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(new Date().getFullYear() + 5).optional(),
  asOf: z.string().datetime().optional(),
  persist: z
    .union([z.literal('true'), z.literal('false')])
    .transform((value) => value === 'true')
    .optional()
});

wealthRouter.get('/family/overview', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const parsed = overviewQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      return res.status(400).json({ error: 'Paramètres invalides.' });
    }

    const { year, asOf, persist } = parsed.data;
    const overview = await buildFamilyWealthOverview(req.userId!, {
      year,
      asOf: asOf ? new Date(asOf) : undefined,
      persistSnapshot: persist ?? false
    });

    res.json(overview);
  } catch (error) {
    next(error);
  }
});

wealthRouter.get('/family/history', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const history = await buildFamilyWealthHistory(req.userId!);
    res.json(history);
  } catch (error) {
    next(error);
  }
});

wealthRouter.get('/family/scenarios', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const scenarios = await listFamilyWealthScenarios(req.userId!);
    res.json(scenarios);
  } catch (error) {
    next(error);
  }
});

const scenarioBodySchema = z.object({
  label: z.string().trim().min(1).max(255),
  scenarioType: z.string().trim().max(64).optional(),
  horizonYears: z.number().int().min(1).max(50),
  growthRatePercent: z.number().min(-100).max(100).optional(),
  drawdownPercent: z.number().min(0).max(100).optional(),
  annualContribution: z.number().min(-1_000_000).max(1_000_000).optional(),
  annualWithdrawal: z.number().min(-1_000_000).max(1_000_000).optional(),
  persist: z.boolean().optional()
});

wealthRouter.post('/family/scenarios', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const payload = scenarioBodySchema.parse(req.body);

    const scenario = await runFamilyWealthScenario(
      req.userId!,
      {
        label: payload.label,
        scenarioType: payload.scenarioType,
        horizonYears: payload.horizonYears,
        growthRatePercent: payload.growthRatePercent,
        drawdownPercent: payload.drawdownPercent,
        annualContribution: payload.annualContribution,
        annualWithdrawal: payload.annualWithdrawal
      },
      { persist: payload.persist ?? false }
    );

    res.status(payload.persist ? 201 : 200).json(scenario);
  } catch (error) {
    next(error);
  }
});

wealthRouter.delete('/family/scenarios/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Identifiant invalide.' });
    }

    const deleted = await deleteFamilyWealthScenario(req.userId!, id);

    if (!deleted) {
      return res.status(404).json({ error: 'Scénario introuvable.' });
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

const stressTestSchema = z.object({
  rentDropPercent: z.number().min(-100).max(100).optional(),
  propertyValueShockPercent: z.number().min(-100).max(100).optional(),
  interestRateShockPercent: z.number().min(-100).max(100).optional(),
  marketShockPercent: z.number().min(-100).max(100).optional()
});

wealthRouter.post('/family/stress-test', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const payload = stressTestSchema.parse(req.body ?? {});
    const result = await runFamilyWealthStressTest(req.userId!, payload);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export { wealthRouter };
