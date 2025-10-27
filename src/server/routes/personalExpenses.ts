import { Router, Response, NextFunction } from 'express';
import type { PersonalExpense } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '../lib/prisma';
import { authenticated, AuthenticatedRequest } from '../middlewares/authenticated';

const personalExpensesRouter = Router();

const frequencyEnum = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.enum(['ONE_TIME', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL']));

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

const personalExpenseBodySchema = z.object({
  label: z.string().trim().min(1),
  category: optionalString,
  amount: z.coerce.number().nonnegative(),
  frequency: frequencyEnum.default('MONTHLY'),
  startDate: coerceDate.optional(),
  endDate: coerceDate.optional(),
  essential: z.coerce.boolean().default(false),
  notes: nullableString
});

const listQuerySchema = z.object({
  category: optionalString,
  essential: z.boolean().optional()
});

const idParamsSchema = z.object({
  id: z.coerce.number().int().positive()
});

function serialize(record: PersonalExpense) {
  return {
    id: record.id,
    label: record.label,
    category: record.category ?? null,
    amount: Number(record.amount ?? 0),
    frequency: record.frequency,
    startDate: record.startDate ? record.startDate.toISOString() : null,
    endDate: record.endDate ? record.endDate.toISOString() : null,
    essential: Boolean(record.essential),
    notes: record.notes ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

personalExpensesRouter.use(authenticated);

personalExpensesRouter.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const filters = listQuerySchema.parse({
      category: req.query.category,
      essential:
        typeof req.query.essential === 'string' ? req.query.essential === 'true' : undefined
    });

    const expenses = await prisma.personalExpense.findMany({
      where: {
        userId: req.userId,
        ...(filters.category ? { category: filters.category } : {}),
        ...(filters.essential !== undefined ? { essential: filters.essential } : {})
      },
      orderBy: [{ essential: 'desc' }, { amount: 'desc' }, { createdAt: 'desc' }]
    });

    res.json(expenses.map(serialize));
  } catch (error) {
    next(error);
  }
});

personalExpensesRouter.post('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const payload = personalExpenseBodySchema.parse(req.body);

    const created = await prisma.personalExpense.create({
      data: {
        userId: req.userId!,
        label: payload.label,
        category: payload.category ?? null,
        amount: payload.amount,
        frequency: payload.frequency,
        startDate: payload.startDate ?? null,
        endDate: payload.endDate ?? null,
        essential: payload.essential,
        notes: payload.notes ?? null
      }
    });

    res.status(201).json(serialize(created));
  } catch (error) {
    next(error);
  }
});

personalExpensesRouter.put(
  '/:id',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamsSchema.parse(req.params);
      const payload = personalExpenseBodySchema.parse(req.body);

      const existing = await prisma.personalExpense.findFirst({
        where: { id, userId: req.userId }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Dépense introuvable.' });
      }

      const updated = await prisma.personalExpense.update({
        where: { id },
        data: {
          label: payload.label,
          category: payload.category ?? null,
          amount: payload.amount,
          frequency: payload.frequency,
          startDate: payload.startDate ?? null,
          endDate: payload.endDate ?? null,
          essential: payload.essential,
          notes: payload.notes ?? null
        }
      });

      res.json(serialize(updated));
    } catch (error) {
      next(error);
    }
  }
);

personalExpensesRouter.delete(
  '/:id',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamsSchema.parse(req.params);

      const deleted = await prisma.personalExpense.deleteMany({
        where: { id, userId: req.userId }
      });

      if (deleted.count === 0) {
        return res.status(404).json({ error: 'Dépense introuvable.' });
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

export { personalExpensesRouter };
