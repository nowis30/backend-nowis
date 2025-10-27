import { Router, Response, NextFunction } from 'express';
import type { PersonalLiability } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '../lib/prisma';
import { authenticated, AuthenticatedRequest } from '../middlewares/authenticated';

const personalLiabilitiesRouter = Router();

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

const liabilityBodySchema = z.object({
  label: z.string().trim().min(1),
  category: optionalString,
  counterparty: nullableString,
  balance: z.coerce.number().nonnegative().default(0),
  interestRate: z.coerce.number().min(0).max(1).nullable().optional(),
  maturityDate: coerceDate.optional(),
  notes: nullableString
});

const listQuerySchema = z.object({
  category: optionalString
});

const idParamsSchema = z.object({
  id: z.coerce.number().int().positive()
});

function serialize(record: PersonalLiability) {
  return {
    id: record.id,
    label: record.label,
    category: record.category ?? null,
    counterparty: record.counterparty ?? null,
    balance: Number(record.balance ?? 0),
    interestRate: record.interestRate !== null && record.interestRate !== undefined ? Number(record.interestRate) : null,
    maturityDate: record.maturityDate ? record.maturityDate.toISOString() : null,
    notes: record.notes ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

personalLiabilitiesRouter.use(authenticated);

personalLiabilitiesRouter.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const filters = listQuerySchema.parse({ category: req.query.category });

    const liabilities = await prisma.personalLiability.findMany({
      where: {
        userId: req.userId,
        ...(filters.category ? { category: filters.category } : {})
      },
      orderBy: [{ label: 'asc' }]
    });

    res.json(liabilities.map(serialize));
  } catch (error) {
    next(error);
  }
});

personalLiabilitiesRouter.post('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const payload = liabilityBodySchema.parse(req.body);

    const created = await prisma.personalLiability.create({
      data: {
        userId: req.userId!,
        label: payload.label,
        category: payload.category ?? null,
        counterparty: payload.counterparty ?? null,
        balance: payload.balance,
        interestRate: payload.interestRate ?? null,
        maturityDate: payload.maturityDate ?? null,
        notes: payload.notes ?? null
      }
    });

    res.status(201).json(serialize(created));
  } catch (error) {
    next(error);
  }
});

personalLiabilitiesRouter.put(
  '/:id',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamsSchema.parse(req.params);
      const payload = liabilityBodySchema.parse(req.body);

      const existing = await prisma.personalLiability.findFirst({
        where: { id, userId: req.userId }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Passif introuvable.' });
      }

      const updated = await prisma.personalLiability.update({
        where: { id },
        data: {
          label: payload.label,
          category: payload.category ?? null,
          counterparty: payload.counterparty ?? null,
          balance: payload.balance,
          interestRate: payload.interestRate ?? null,
          maturityDate: payload.maturityDate ?? null,
          notes: payload.notes ?? null
        }
      });

      res.json(serialize(updated));
    } catch (error) {
      next(error);
    }
  }
);

personalLiabilitiesRouter.delete(
  '/:id',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamsSchema.parse(req.params);

      const deleted = await prisma.personalLiability.deleteMany({
        where: { id, userId: req.userId }
      });

      if (deleted.count === 0) {
        return res.status(404).json({ error: 'Passif introuvable.' });
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

export { personalLiabilitiesRouter };
