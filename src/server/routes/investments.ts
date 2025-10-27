import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';

import {
  createInvestmentAccount,
  createInvestmentHolding,
  createInvestmentTransaction,
  deleteInvestmentAccount,
  deleteInvestmentHolding,
  deleteInvestmentTransaction,
  listInvestmentAccounts,
  updateInvestmentAccount,
  updateInvestmentHolding
} from '../services/investmentService';
import { authenticated, AuthenticatedRequest } from '../middlewares/authenticated';

const investmentsRouter = Router();

const optionalString = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .optional();

const nullableString = optionalString.nullable();

const accountBodySchema = z.object({
  label: z.string().trim().min(1),
  accountType: optionalString.default('TAXABLE'),
  institution: nullableString,
  accountNumber: nullableString,
  currency: optionalString.default('CAD')
});

const accountIdParamsSchema = z.object({
  accountId: z.coerce.number().int().positive()
});

const holdingIdParamsSchema = z.object({
  holdingId: z.coerce.number().int().positive()
});

const transactionIdParamsSchema = z.object({
  transactionId: z.coerce.number().int().positive()
});

const holdingBodySchema = z.object({
  symbol: z.string().trim().min(1),
  description: nullableString,
  quantity: z.coerce.number().nonnegative().default(0),
  bookValue: z.coerce.number().nonnegative().default(0),
  marketValue: z.coerce.number().nonnegative().default(0),
  currency: optionalString.default('CAD'),
  targetAllocation: z.coerce.number().min(0).max(1).nullable().optional()
});

const coerceDate = z
  .union([z.string(), z.date()])
  .transform((value) => (value instanceof Date ? value : new Date(value)))
  .refine((value) => !Number.isNaN(value?.getTime()), { message: 'Date invalide.' });

const transactionBodySchema = z.object({
  transactionType: z.string().trim().min(1),
  symbol: z.string().trim().min(1),
  tradeDate: coerceDate,
  quantity: z.coerce.number(),
  price: z.coerce.number(),
  fees: z.coerce.number().default(0),
  notes: nullableString,
  holdingId: z.coerce.number().int().positive().optional()
});

investmentsRouter.use(authenticated);

investmentsRouter.get('/accounts', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const accounts = await listInvestmentAccounts(req.userId!);
    res.json(accounts);
  } catch (error) {
    next(error);
  }
});

investmentsRouter.post('/accounts', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const payload = accountBodySchema.parse(req.body);
    const created = await createInvestmentAccount(req.userId!, payload);
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

investmentsRouter.put(
  '/accounts/:accountId',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { accountId } = accountIdParamsSchema.parse(req.params);
      const payload = accountBodySchema.parse(req.body);
      const updated = await updateInvestmentAccount(req.userId!, accountId, payload);

      if (!updated) {
        return res.status(404).json({ error: "Compte d'investissement introuvable." });
      }

      res.json(updated);
    } catch (error) {
      next(error);
    }
  }
);

investmentsRouter.delete(
  '/accounts/:accountId',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { accountId } = accountIdParamsSchema.parse(req.params);
      const deleted = await deleteInvestmentAccount(req.userId!, accountId);

      if (!deleted) {
        return res.status(404).json({ error: "Compte d'investissement introuvable." });
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

investmentsRouter.post(
  '/accounts/:accountId/holdings',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { accountId } = accountIdParamsSchema.parse(req.params);
      const payload = holdingBodySchema.parse(req.body);
      const created = await createInvestmentHolding(req.userId!, accountId, payload);

      if (!created) {
        return res.status(404).json({ error: "Compte d'investissement introuvable." });
      }

      res.status(201).json(created);
    } catch (error) {
      next(error);
    }
  }
);

investmentsRouter.put(
  '/holdings/:holdingId',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { holdingId } = holdingIdParamsSchema.parse(req.params);
      const payload = holdingBodySchema.parse(req.body);
      const updated = await updateInvestmentHolding(req.userId!, holdingId, payload);

      if (!updated) {
        return res.status(404).json({ error: 'Position introuvable.' });
      }

      res.json(updated);
    } catch (error) {
      next(error);
    }
  }
);

investmentsRouter.delete(
  '/holdings/:holdingId',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { holdingId } = holdingIdParamsSchema.parse(req.params);
      const deleted = await deleteInvestmentHolding(req.userId!, holdingId);

      if (!deleted) {
        return res.status(404).json({ error: 'Position introuvable.' });
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

investmentsRouter.post(
  '/accounts/:accountId/transactions',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { accountId } = accountIdParamsSchema.parse(req.params);
      const payload = transactionBodySchema.parse(req.body);
      const created = await createInvestmentTransaction(req.userId!, accountId, payload);

      if (!created) {
        return res.status(404).json({ error: 'Transaction impossible.' });
      }

      res.status(201).json(created);
    } catch (error) {
      next(error);
    }
  }
);

investmentsRouter.delete(
  '/transactions/:transactionId',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { transactionId } = transactionIdParamsSchema.parse(req.params);
      const deleted = await deleteInvestmentTransaction(req.userId!, transactionId);

      if (!deleted) {
        return res.status(404).json({ error: 'Transaction introuvable.' });
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

export { investmentsRouter };
