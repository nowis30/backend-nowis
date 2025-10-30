/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';

import { prisma } from '../lib/prisma';
import { authenticated, AuthenticatedRequest } from '../middlewares/authenticated';

const mdcRouter = Router();

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

// PERSON
const personBodySchema = z.object({
  displayName: z.string().trim().min(1),
  birthDate: coerceDate.optional(),
  gender: optionalString,
  address: nullableString
});

const idParamsSchema = z.object({ id: z.coerce.number().int().positive() });

function serializePerson(p: any) {
  return {
    id: p.id,
    displayName: p.displayName,
    birthDate: p.birthDate ? p.birthDate.toISOString() : null,
    gender: p.gender ?? null,
    address: p.address ?? null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString()
  };
}

// HOUSEHOLD
const householdBodySchema = z.object({
  year: z.coerce.number().int().min(1900).max(3000),
  members: z
    .array(
      z.object({
        personId: z.coerce.number().int().positive(),
        relationship: optionalString,
        isPrimary: z.boolean().optional()
      })
    )
    .optional()
});

function serializeHousehold(h: any) {
  return {
    id: h.id,
    year: h.year,
    createdAt: h.createdAt.toISOString(),
    updatedAt: h.updatedAt.toISOString(),
    members: (h.members ?? []).map((m: any) => ({
      id: m.id,
      personId: m.personId,
      relationship: m.relationship ?? null,
      isPrimary: !!m.isPrimary,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
      person: m.person
        ? {
            id: m.person.id,
            displayName: m.person.displayName,
            birthDate: m.person.birthDate ? m.person.birthDate.toISOString() : null,
            gender: m.person.gender ?? null,
            address: m.person.address ?? null
          }
        : undefined
    }))
  };
}

// LEGAL ENTITY
const legalEntityBodySchema = z.object({
  name: z.string().trim().min(1),
  type: z.string().trim().min(1),
  jurisdiction: optionalString,
  companyId: z.coerce.number().int().positive().optional()
});

function serializeEntity(e: any) {
  return {
    id: e.id,
    name: e.name,
    type: e.type,
    jurisdiction: e.jurisdiction ?? null,
    companyId: e.companyId ?? null,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString()
  };
}

mdcRouter.use(authenticated);

// NOTE: Les modèles Person/Household/LegalEntity viennent d'être ajoutés.
// Si le client Prisma n'a pas encore été regénéré, le typage TS peut échouer.
// Pour éviter de bloquer la compilation avant un `prisma generate`, on cast en `any`.
const prismaAny = prisma as any;

// Persons
mdcRouter.get('/persons', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const persons = await prismaAny.person.findMany({ where: { userId: req.userId }, orderBy: [{ id: 'asc' }] });
    res.json(persons.map(serializePerson));
  } catch (error) {
    next(error);
  }
});

mdcRouter.post('/persons', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const payload = personBodySchema.parse(req.body);
    const created = await prismaAny.person.create({
      data: {
        userId: req.userId!,
        displayName: payload.displayName,
        birthDate: payload.birthDate ?? null,
        gender: payload.gender ?? null,
        address: payload.address ?? null
      }
    });
    res.status(201).json(serializePerson(created));
  } catch (error) {
    next(error);
  }
});

mdcRouter.put('/persons/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamsSchema.parse(req.params);
    const payload = personBodySchema.parse(req.body);

    const existing = await prismaAny.person.findFirst({ where: { id, userId: req.userId } });
    if (!existing) return res.status(404).json({ error: 'Personne introuvable.' });

    const updated = await prismaAny.person.update({
      where: { id },
      data: {
        displayName: payload.displayName,
        birthDate: payload.birthDate ?? null,
        gender: payload.gender ?? null,
        address: payload.address ?? null
      }
    });

    res.json(serializePerson(updated));
  } catch (error) {
    next(error);
  }
});

mdcRouter.delete('/persons/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamsSchema.parse(req.params);
    const deleted = await prismaAny.person.deleteMany({ where: { id, userId: req.userId } });
    if (deleted.count === 0) return res.status(404).json({ error: 'Personne introuvable.' });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// Households
mdcRouter.get('/households', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    const records = await prismaAny.household.findMany({
      where: { userId },
      include: { members: { include: { person: true } } },
      orderBy: [{ year: 'desc' }, { id: 'desc' }]
    });
    res.json(records.map(serializeHousehold));
  } catch (error) {
    next(error);
  }
});

mdcRouter.post('/households', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const payload = householdBodySchema.parse(req.body);
    const created = await prismaAny.household.create({
      data: {
        userId: req.userId!,
        year: payload.year,
        members: payload.members
          ? {
              create: payload.members.map((m) => ({
                personId: m.personId,
                relationship: m.relationship ?? null,
                isPrimary: !!m.isPrimary
              }))
            }
          : undefined
      },
      include: { members: { include: { person: true } } }
    });

    res.status(201).json(serializeHousehold(created));
  } catch (error) {
    next(error);
  }
});

mdcRouter.put('/households/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamsSchema.parse(req.params);
    const payload = householdBodySchema.pick({ year: true }).parse(req.body);

    const existing = await prismaAny.household.findFirst({ where: { id, userId: req.userId } });
    if (!existing) return res.status(404).json({ error: 'Foyer fiscal introuvable.' });

    const updated = await prismaAny.household.update({ where: { id }, data: { year: payload.year } });
    res.json(serializeHousehold({ ...updated, members: [] }));
  } catch (error) {
    next(error);
  }
});

const memberBodySchema = z.object({
  personId: z.coerce.number().int().positive(),
  relationship: optionalString,
  isPrimary: z.boolean().optional()
});

mdcRouter.post(
  '/households/:id/members',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamsSchema.parse(req.params);
      const payload = memberBodySchema.parse(req.body);

      const household = await prismaAny.household.findFirst({ where: { id, userId: req.userId } });
      if (!household) return res.status(404).json({ error: 'Foyer fiscal introuvable.' });

      const created = await prismaAny.householdMember.create({
        data: {
          householdId: id,
          personId: payload.personId,
          relationship: payload.relationship ?? null,
          isPrimary: !!payload.isPrimary
        }
      });

      res.status(201).json({
        id: created.id,
        personId: created.personId,
        relationship: created.relationship ?? null,
        isPrimary: !!created.isPrimary,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString()
      });
    } catch (error) {
      next(error);
    }
  }
);

mdcRouter.delete(
  '/households/:id/members/:memberId',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamsSchema.parse({ id: (req.params as any).id });
      const { id: memberId } = idParamsSchema.parse({ id: (req.params as any).memberId });

      const household = await prismaAny.household.findFirst({ where: { id, userId: req.userId } });
      if (!household) return res.status(404).json({ error: 'Foyer fiscal introuvable.' });

      const deleted = await prismaAny.householdMember.deleteMany({ where: { id: memberId, householdId: id } });
      if (deleted.count === 0) return res.status(404).json({ error: 'Membre introuvable.' });

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

// Legal entities
mdcRouter.get('/entities', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const records = await prismaAny.legalEntity.findMany({ where: { userId: req.userId }, orderBy: [{ id: 'desc' }] });
    res.json(records.map(serializeEntity));
  } catch (error) {
    next(error);
  }
});

mdcRouter.post('/entities', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const payload = legalEntityBodySchema.parse(req.body);
    const created = await prismaAny.legalEntity.create({
      data: {
        userId: req.userId!,
        name: payload.name,
        type: payload.type,
        jurisdiction: payload.jurisdiction ?? null,
        companyId: payload.companyId ?? null
      }
    });
    res.status(201).json(serializeEntity(created));
  } catch (error) {
    next(error);
  }
});

mdcRouter.put('/entities/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamsSchema.parse(req.params);
    const payload = legalEntityBodySchema.parse(req.body);

    const existing = await prismaAny.legalEntity.findFirst({ where: { id, userId: req.userId } });
    if (!existing) return res.status(404).json({ error: "Entité légale introuvable." });

    const updated = await prismaAny.legalEntity.update({
      where: { id },
      data: {
        name: payload.name,
        type: payload.type,
        jurisdiction: payload.jurisdiction ?? null,
        companyId: payload.companyId ?? null
      }
    });

    res.json(serializeEntity(updated));
  } catch (error) {
    next(error);
  }
});

mdcRouter.delete('/entities/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamsSchema.parse(req.params);
    const deleted = await prismaAny.legalEntity.deleteMany({ where: { id, userId: req.userId } });
    if (deleted.count === 0) return res.status(404).json({ error: "Entité légale introuvable." });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export { mdcRouter };
