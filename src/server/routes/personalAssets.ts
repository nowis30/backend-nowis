import { Router, Response, NextFunction } from 'express';
import type { PersonalAsset } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '../lib/prisma';
import { authenticated, AuthenticatedRequest } from '../middlewares/authenticated';

const personalAssetsRouter = Router();

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

const assetBodySchema = z.object({
  label: z.string().trim().min(1),
  category: optionalString,
  ownerType: optionalString.default('PERSONAL'),
  ownerNotes: nullableString,
  valuation: z.coerce.number().nonnegative().default(0),
  valuationDate: coerceDate,
  liquidityTag: optionalString,
  notes: nullableString
});

const listQuerySchema = z.object({
  ownerType: optionalString,
  category: optionalString
});

const idParamsSchema = z.object({
  id: z.coerce.number().int().positive()
});

function serialize(record: PersonalAsset) {
  return {
    id: record.id,
    label: record.label,
    category: record.category ?? null,
    ownerType: record.ownerType,
    ownerNotes: record.ownerNotes ?? null,
    valuation: Number(record.valuation ?? 0),
    valuationDate: record.valuationDate.toISOString(),
    liquidityTag: record.liquidityTag ?? null,
    notes: record.notes ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

personalAssetsRouter.use(authenticated);

personalAssetsRouter.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const filters = listQuerySchema.parse({
      ownerType: req.query.ownerType,
      category: req.query.category
    });

    const assets = await prisma.personalAsset.findMany({
      where: {
        userId: req.userId,
        ...(filters.ownerType ? { ownerType: filters.ownerType } : {}),
        ...(filters.category ? { category: filters.category } : {})
      },
      orderBy: [{ valuationDate: 'desc' }, { id: 'desc' }]
    });

    res.json(assets.map(serialize));
  } catch (error) {
    next(error);
  }
});

personalAssetsRouter.post('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const payload = assetBodySchema.parse(req.body);

    const created = await prisma.personalAsset.create({
      data: {
        userId: req.userId!,
        label: payload.label,
        category: payload.category ?? null,
        ownerType: payload.ownerType ?? 'PERSONAL',
        ownerNotes: payload.ownerNotes ?? null,
        valuation: payload.valuation,
        valuationDate: payload.valuationDate,
        liquidityTag: payload.liquidityTag ?? null,
        notes: payload.notes ?? null
      }
    });

    res.status(201).json(serialize(created));
  } catch (error) {
    next(error);
  }
});

personalAssetsRouter.put(
  '/:id',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamsSchema.parse(req.params);
      const payload = assetBodySchema.parse(req.body);

      const existing = await prisma.personalAsset.findFirst({
        where: { id, userId: req.userId }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Actif introuvable.' });
      }

      const updated = await prisma.personalAsset.update({
        where: { id },
        data: {
          label: payload.label,
          category: payload.category ?? null,
          ownerType: payload.ownerType ?? 'PERSONAL',
          ownerNotes: payload.ownerNotes ?? null,
          valuation: payload.valuation,
          valuationDate: payload.valuationDate,
          liquidityTag: payload.liquidityTag ?? null,
          notes: payload.notes ?? null
        }
      });

      res.json(serialize(updated));
    } catch (error) {
      next(error);
    }
  }
);

personalAssetsRouter.delete(
  '/:id',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamsSchema.parse(req.params);

      const deleted = await prisma.personalAsset.deleteMany({
        where: { id, userId: req.userId }
      });

      if (deleted.count === 0) {
        return res.status(404).json({ error: 'Actif introuvable.' });
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

export { personalAssetsRouter };
