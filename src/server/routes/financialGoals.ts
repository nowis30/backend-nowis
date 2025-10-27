import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';

import {
  createFinancialGoal,
  createFinancialGoalProgress,
  deleteFinancialGoal,
  deleteFinancialGoalProgress,
  listFinancialGoals,
  updateFinancialGoal
} from '../services/financialGoalsService';
import { authenticated, AuthenticatedRequest } from '../middlewares/authenticated';

const financialGoalsRouter = Router();

const optionalString = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .optional();

const nullableString = optionalString.nullable();

const coerceDate = z
  .union([z.string(), z.date()])
  .transform((value) => (value instanceof Date ? value : new Date(value)))
  .refine((value) => !Number.isNaN(value?.getTime()), { message: 'Date invalide.' });

const goalBodySchema = z.object({
  name: z.string().trim().min(1),
  goalType: optionalString.default('GENERAL'),
  targetAmount: z.coerce.number().nonnegative().default(0),
  targetDate: coerceDate.nullable().optional(),
  priority: z.coerce.number().int().min(1).max(5).default(3),
  status: optionalString.default('ACTIVE'),
  description: nullableString
});

const goalIdParamsSchema = z.object({
  goalId: z.coerce.number().int().positive()
});

const progressIdParamsSchema = z.object({
  progressId: z.coerce.number().int().positive()
});

const progressBodySchema = z.object({
  progressDate: coerceDate.optional(),
  amount: z.coerce.number(),
  notes: nullableString
});

financialGoalsRouter.use(authenticated);

financialGoalsRouter.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const goals = await listFinancialGoals(req.userId!);
    res.json(goals);
  } catch (error) {
    next(error);
  }
});

financialGoalsRouter.post('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const payload = goalBodySchema.parse(req.body);
    const created = await createFinancialGoal(req.userId!, payload);
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

financialGoalsRouter.put(
  '/:goalId',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { goalId } = goalIdParamsSchema.parse(req.params);
      const payload = goalBodySchema.parse(req.body);
      const updated = await updateFinancialGoal(req.userId!, goalId, payload);

      if (!updated) {
        return res.status(404).json({ error: 'Objectif introuvable.' });
      }

      res.json(updated);
    } catch (error) {
      next(error);
    }
  }
);

financialGoalsRouter.delete(
  '/:goalId',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { goalId } = goalIdParamsSchema.parse(req.params);
      const deleted = await deleteFinancialGoal(req.userId!, goalId);

      if (!deleted) {
        return res.status(404).json({ error: 'Objectif introuvable.' });
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

financialGoalsRouter.post(
  '/:goalId/progress',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { goalId } = goalIdParamsSchema.parse(req.params);
      const payload = progressBodySchema.parse(req.body);
      const created = await createFinancialGoalProgress(req.userId!, goalId, payload);

      if (!created) {
        return res.status(404).json({ error: 'Mise à jour impossible.' });
      }

      res.status(201).json(created);
    } catch (error) {
      next(error);
    }
  }
);

financialGoalsRouter.delete(
  '/:goalId/progress/:progressId',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { goalId } = goalIdParamsSchema.parse(req.params);
      const { progressId } = progressIdParamsSchema.parse(req.params);
      const deleted = await deleteFinancialGoalProgress(req.userId!, goalId, progressId);

      if (!deleted) {
        return res.status(404).json({ error: 'Point de progression introuvable.' });
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

export { financialGoalsRouter };
