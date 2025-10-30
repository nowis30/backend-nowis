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

// Persons
mdcRouter.get('/persons', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const persons = await prisma.person.findMany({ where: { userId: req.userId }, orderBy: [{ id: 'asc' }] });
    res.json(persons.map(serializePerson));
  } catch (error) {
    next(error);
  }
});

mdcRouter.post('/persons', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const payload = personBodySchema.parse(req.body);
  const created = await prisma.person.create({
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

  const existing = await prisma.person.findFirst({ where: { id, userId: req.userId } });
    if (!existing) return res.status(404).json({ error: 'Personne introuvable.' });

  const updated = await prisma.person.update({
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
  const deleted = await prisma.person.deleteMany({ where: { id, userId: req.userId } });
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
  const records = await prisma.household.findMany({
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
  const created = await prisma.household.create({
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

  const existing = await prisma.household.findFirst({ where: { id, userId: req.userId } });
    if (!existing) return res.status(404).json({ error: 'Foyer fiscal introuvable.' });

  const updated = await prisma.household.update({ where: { id }, data: { year: payload.year } });
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

  const household = await prisma.household.findFirst({ where: { id, userId: req.userId } });
      if (!household) return res.status(404).json({ error: 'Foyer fiscal introuvable.' });

  const created = await prisma.householdMember.create({
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

  const household = await prisma.household.findFirst({ where: { id, userId: req.userId } });
      if (!household) return res.status(404).json({ error: 'Foyer fiscal introuvable.' });

  const deleted = await prisma.householdMember.deleteMany({ where: { id: memberId, householdId: id } });
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
    const records = await prisma.legalEntity.findMany({ where: { userId: req.userId }, orderBy: [{ id: 'desc' }] });
    res.json(records.map(serializeEntity));
  } catch (error) {
    next(error);
  }
});

mdcRouter.post('/entities', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const payload = legalEntityBodySchema.parse(req.body);
  const created = await prisma.legalEntity.create({
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

  const existing = await prisma.legalEntity.findFirst({ where: { id, userId: req.userId } });
    if (!existing) return res.status(404).json({ error: "Entité légale introuvable." });

  const updated = await prisma.legalEntity.update({
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
  const deleted = await prisma.legalEntity.deleteMany({ where: { id, userId: req.userId } });
    if (deleted.count === 0) return res.status(404).json({ error: "Entité légale introuvable." });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// Journal transactions (double-partie)
const entryLineSchema = z.object({
  accountCode: z.string().trim().min(1),
  debit: z.coerce.number().nonnegative().default(0),
  credit: z.coerce.number().nonnegative().default(0),
  memo: nullableString
});

const journalEntryBody = z.object({
  entryDate: coerceDate.optional(),
  description: nullableString,
  reference: nullableString,
  lines: z.array(entryLineSchema).min(2)
});

function isBalanced(lines: Array<{ debit?: number; credit?: number }>): boolean {
  const totalDebit = lines.reduce((s, l) => s + Number(l.debit ?? 0), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit ?? 0), 0);
  // Arrondir pour éviter les effets virgule flottante
  return Math.abs(totalDebit - totalCredit) < 1e-6;
}

mdcRouter.post('/transactions', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const payload = journalEntryBody.parse(req.body);

    if (!isBalanced(payload.lines)) {
      return res.status(400).json({ error: 'Écriture non équilibrée: somme débits ≠ somme crédits.' });
    }

  const created = await prisma.journalEntry.create({
      data: {
        userId: req.userId!,
        entryDate: payload.entryDate ?? new Date(),
        description: payload.description ?? null,
        reference: payload.reference ?? null,
        lines: {
          create: payload.lines.map((l) => ({
            accountCode: l.accountCode,
            debit: l.debit ?? 0,
            credit: l.credit ?? 0,
            memo: l.memo ?? null
          }))
        }
      },
      include: { lines: true }
    });

    res.status(201).json({
      id: created.id,
      entryDate: created.entryDate.toISOString(),
      description: created.description ?? null,
      reference: created.reference ?? null,
      lines: created.lines.map((ln: any) => ({
        id: ln.id,
        accountCode: ln.accountCode,
        debit: Number(ln.debit ?? 0),
        credit: Number(ln.credit ?? 0),
        memo: ln.memo ?? null
      })),
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString()
    });
  } catch (error) {
    next(error);
  }
});

mdcRouter.get('/transactions', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
  const entries = await prisma.journalEntry.findMany({
      where: { userId: req.userId },
      include: { lines: true },
      orderBy: [{ entryDate: 'desc' }, { id: 'desc' }]
    });
    res.json(
      entries.map((e: any) => ({
        id: e.id,
        entryDate: e.entryDate.toISOString(),
        description: e.description ?? null,
        reference: e.reference ?? null,
        lines: e.lines.map((ln: any) => ({
          id: ln.id,
          accountCode: ln.accountCode,
          debit: Number(ln.debit ?? 0),
          credit: Number(ln.credit ?? 0),
          memo: ln.memo ?? null
        })),
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString()
      }))
    );
  } catch (error) {
    next(error);
  }
});

export { mdcRouter };

// --- Finance CRUD: Loan, Lease, GenericIncome, GenericExpense ---

// Common helpers
const optionalInt = z.coerce.number().int().positive().optional();

// Loan
const loanBodySchema = z.object({
  label: z.string().trim().min(1),
  principal: z.coerce.number(),
  interestRate: z.coerce.number(),
  startDate: coerceDate,
  maturityDate: coerceDate.optional(),
  paymentFrequency: z.coerce.number().int().positive().default(12),
  personId: optionalInt,
  householdId: optionalInt,
  legalEntityId: optionalInt,
  companyId: optionalInt,
  propertyId: optionalInt,
  notes: nullableString
});

mdcRouter.get('/loans', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const loans = await prisma.loan.findMany({ where: { userId: req.userId }, orderBy: [{ id: 'desc' }] });
    res.json(
      loans.map((l) => ({
        id: l.id,
        label: l.label,
        principal: Number(l.principal),
        interestRate: Number(l.interestRate),
        startDate: l.startDate.toISOString(),
        maturityDate: l.maturityDate ? l.maturityDate.toISOString() : null,
        paymentFrequency: l.paymentFrequency,
        personId: l.personId ?? null,
        householdId: l.householdId ?? null,
        legalEntityId: l.legalEntityId ?? null,
        companyId: l.companyId ?? null,
        propertyId: l.propertyId ?? null,
        notes: l.notes ?? null,
        createdAt: l.createdAt.toISOString(),
        updatedAt: l.updatedAt.toISOString()
      }))
    );
  } catch (error) {
    next(error);
  }
});

mdcRouter.post('/loans', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const payload = loanBodySchema.parse(req.body);
    const created = await prisma.loan.create({
      data: {
        userId: req.userId!,
        label: payload.label,
        principal: payload.principal,
        interestRate: payload.interestRate,
        startDate: payload.startDate,
        maturityDate: payload.maturityDate ?? null,
        paymentFrequency: payload.paymentFrequency ?? 12,
        personId: payload.personId ?? null,
        householdId: payload.householdId ?? null,
        legalEntityId: payload.legalEntityId ?? null,
        companyId: payload.companyId ?? null,
        propertyId: payload.propertyId ?? null,
        notes: payload.notes ?? null
      }
    });
    res.status(201).json({ id: created.id });
  } catch (error) {
    next(error);
  }
});

mdcRouter.put('/loans/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamsSchema.parse(req.params);
    const existing = await prisma.loan.findFirst({ where: { id, userId: req.userId } });
    if (!existing) return res.status(404).json({ error: 'Prêt introuvable.' });
    const payload = loanBodySchema.partial().parse(req.body);
    const updated = await prisma.loan.update({
      where: { id },
      data: {
        label: payload.label ?? existing.label,
        principal: payload.principal ?? existing.principal,
        interestRate: payload.interestRate ?? existing.interestRate,
        startDate: payload.startDate ?? existing.startDate,
        maturityDate: payload.maturityDate === undefined ? existing.maturityDate : payload.maturityDate,
        paymentFrequency: payload.paymentFrequency ?? existing.paymentFrequency,
        personId: payload.personId === undefined ? existing.personId : payload.personId,
        householdId: payload.householdId === undefined ? existing.householdId : payload.householdId,
        legalEntityId: payload.legalEntityId === undefined ? existing.legalEntityId : payload.legalEntityId,
        companyId: payload.companyId === undefined ? existing.companyId : payload.companyId,
        propertyId: payload.propertyId === undefined ? existing.propertyId : payload.propertyId,
        notes: payload.notes === undefined ? existing.notes : payload.notes
      }
    });
    res.json({ id: updated.id });
  } catch (error) {
    next(error);
  }
});

mdcRouter.delete('/loans/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamsSchema.parse(req.params);
    const deleted = await prisma.loan.deleteMany({ where: { id, userId: req.userId } });
    if (deleted.count === 0) return res.status(404).json({ error: 'Prêt introuvable.' });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// Lease
const leaseBodySchema = z.object({
  propertyId: optionalInt,
  unitId: optionalInt,
  tenantName: z.string().trim().min(1),
  startDate: coerceDate,
  endDate: coerceDate.optional(),
  rentAmount: z.coerce.number().nonnegative().default(0),
  frequency: z.string().trim().default('MONTHLY'),
  notes: nullableString
});

mdcRouter.get('/leases', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const leases = await prisma.lease.findMany({ where: { userId: req.userId }, orderBy: [{ id: 'desc' }] });
    res.json(
      leases.map((l) => ({
        id: l.id,
        propertyId: l.propertyId ?? null,
        unitId: l.unitId ?? null,
        tenantName: l.tenantName,
        startDate: l.startDate.toISOString(),
        endDate: l.endDate ? l.endDate.toISOString() : null,
        rentAmount: Number(l.rentAmount),
        frequency: l.frequency,
        notes: l.notes ?? null,
        createdAt: l.createdAt.toISOString(),
        updatedAt: l.updatedAt.toISOString()
      }))
    );
  } catch (error) {
    next(error);
  }
});

mdcRouter.post('/leases', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const payload = leaseBodySchema.parse(req.body);
    const created = await prisma.lease.create({
      data: {
        userId: req.userId!,
        propertyId: payload.propertyId ?? null,
        unitId: payload.unitId ?? null,
        tenantName: payload.tenantName,
        startDate: payload.startDate,
        endDate: payload.endDate ?? null,
        rentAmount: payload.rentAmount ?? 0,
        frequency: payload.frequency ?? 'MONTHLY',
        notes: payload.notes ?? null
      }
    });
    res.status(201).json({ id: created.id });
  } catch (error) {
    next(error);
  }
});

mdcRouter.put('/leases/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamsSchema.parse(req.params);
    const existing = await prisma.lease.findFirst({ where: { id, userId: req.userId } });
    if (!existing) return res.status(404).json({ error: 'Bail introuvable.' });
    const payload = leaseBodySchema.partial().parse(req.body);
    const updated = await prisma.lease.update({
      where: { id },
      data: {
        propertyId: payload.propertyId === undefined ? existing.propertyId : payload.propertyId,
        unitId: payload.unitId === undefined ? existing.unitId : payload.unitId,
        tenantName: payload.tenantName ?? existing.tenantName,
        startDate: payload.startDate ?? existing.startDate,
        endDate: payload.endDate === undefined ? existing.endDate : payload.endDate,
        rentAmount: payload.rentAmount ?? existing.rentAmount,
        frequency: payload.frequency ?? existing.frequency,
        notes: payload.notes === undefined ? existing.notes : payload.notes
      }
    });
    res.json({ id: updated.id });
  } catch (error) {
    next(error);
  }
});

mdcRouter.delete('/leases/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamsSchema.parse(req.params);
    const deleted = await prisma.lease.deleteMany({ where: { id, userId: req.userId } });
    if (deleted.count === 0) return res.status(404).json({ error: 'Bail introuvable.' });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// GenericIncome
const incomeBodySchema = z.object({
  label: z.string().trim().min(1),
  category: optionalString,
  amount: z.coerce.number(),
  incomeDate: coerceDate,
  personId: optionalInt,
  householdId: optionalInt,
  legalEntityId: optionalInt,
  companyId: optionalInt,
  propertyId: optionalInt,
  notes: nullableString
});

mdcRouter.get('/incomes', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const list = await prisma.genericIncome.findMany({ where: { userId: req.userId }, orderBy: [{ incomeDate: 'desc' }] });
    res.json(
      list.map((r) => ({
        id: r.id,
        label: r.label,
        category: r.category ?? null,
        amount: Number(r.amount),
        incomeDate: r.incomeDate.toISOString(),
        personId: r.personId ?? null,
        householdId: r.householdId ?? null,
        legalEntityId: r.legalEntityId ?? null,
        companyId: r.companyId ?? null,
        propertyId: r.propertyId ?? null,
        notes: r.notes ?? null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString()
      }))
    );
  } catch (error) {
    next(error);
  }
});

mdcRouter.post('/incomes', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const payload = incomeBodySchema.parse(req.body);
    const created = await prisma.genericIncome.create({
      data: {
        userId: req.userId!,
        label: payload.label,
        category: payload.category ?? null,
        amount: payload.amount,
        incomeDate: payload.incomeDate,
        personId: payload.personId ?? null,
        householdId: payload.householdId ?? null,
        legalEntityId: payload.legalEntityId ?? null,
        companyId: payload.companyId ?? null,
        propertyId: payload.propertyId ?? null,
        notes: payload.notes ?? null
      }
    });
    res.status(201).json({ id: created.id });
  } catch (error) {
    next(error);
  }
});

mdcRouter.put('/incomes/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamsSchema.parse(req.params);
    const existing = await prisma.genericIncome.findFirst({ where: { id, userId: req.userId } });
    if (!existing) return res.status(404).json({ error: 'Revenu introuvable.' });
    const payload = incomeBodySchema.partial().parse(req.body);
    const updated = await prisma.genericIncome.update({
      where: { id },
      data: {
        label: payload.label ?? existing.label,
        category: payload.category === undefined ? existing.category : payload.category,
        amount: payload.amount ?? existing.amount,
        incomeDate: payload.incomeDate ?? existing.incomeDate,
        personId: payload.personId === undefined ? existing.personId : payload.personId,
        householdId: payload.householdId === undefined ? existing.householdId : payload.householdId,
        legalEntityId: payload.legalEntityId === undefined ? existing.legalEntityId : payload.legalEntityId,
        companyId: payload.companyId === undefined ? existing.companyId : payload.companyId,
        propertyId: payload.propertyId === undefined ? existing.propertyId : payload.propertyId,
        notes: payload.notes === undefined ? existing.notes : payload.notes
      }
    });
    res.json({ id: updated.id });
  } catch (error) {
    next(error);
  }
});

mdcRouter.delete('/incomes/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamsSchema.parse(req.params);
    const deleted = await prisma.genericIncome.deleteMany({ where: { id, userId: req.userId } });
    if (deleted.count === 0) return res.status(404).json({ error: 'Revenu introuvable.' });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// GenericExpense
const expenseBodySchema = z.object({
  label: z.string().trim().min(1),
  category: optionalString,
  amount: z.coerce.number(),
  expenseDate: coerceDate,
  personId: optionalInt,
  householdId: optionalInt,
  legalEntityId: optionalInt,
  companyId: optionalInt,
  propertyId: optionalInt,
  notes: nullableString
});

mdcRouter.get('/expenses', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const list = await prisma.genericExpense.findMany({ where: { userId: req.userId }, orderBy: [{ expenseDate: 'desc' }] });
    res.json(
      list.map((r) => ({
        id: r.id,
        label: r.label,
        category: r.category ?? null,
        amount: Number(r.amount),
        expenseDate: r.expenseDate.toISOString(),
        personId: r.personId ?? null,
        householdId: r.householdId ?? null,
        legalEntityId: r.legalEntityId ?? null,
        companyId: r.companyId ?? null,
        propertyId: r.propertyId ?? null,
        notes: r.notes ?? null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString()
      }))
    );
  } catch (error) {
    next(error);
  }
});

mdcRouter.post('/expenses', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const payload = expenseBodySchema.parse(req.body);
    const created = await prisma.genericExpense.create({
      data: {
        userId: req.userId!,
        label: payload.label,
        category: payload.category ?? null,
        amount: payload.amount,
        expenseDate: payload.expenseDate,
        personId: payload.personId ?? null,
        householdId: payload.householdId ?? null,
        legalEntityId: payload.legalEntityId ?? null,
        companyId: payload.companyId ?? null,
        propertyId: payload.propertyId ?? null,
        notes: payload.notes ?? null
      }
    });
    res.status(201).json({ id: created.id });
  } catch (error) {
    next(error);
  }
});

mdcRouter.put('/expenses/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamsSchema.parse(req.params);
    const existing = await prisma.genericExpense.findFirst({ where: { id, userId: req.userId } });
    if (!existing) return res.status(404).json({ error: 'Dépense introuvable.' });
    const payload = expenseBodySchema.partial().parse(req.body);
    const updated = await prisma.genericExpense.update({
      where: { id },
      data: {
        label: payload.label ?? existing.label,
        category: payload.category === undefined ? existing.category : payload.category,
        amount: payload.amount ?? existing.amount,
        expenseDate: payload.expenseDate ?? existing.expenseDate,
        personId: payload.personId === undefined ? existing.personId : payload.personId,
        householdId: payload.householdId === undefined ? existing.householdId : payload.householdId,
        legalEntityId: payload.legalEntityId === undefined ? existing.legalEntityId : payload.legalEntityId,
        companyId: payload.companyId === undefined ? existing.companyId : payload.companyId,
        propertyId: payload.propertyId === undefined ? existing.propertyId : payload.propertyId,
        notes: payload.notes === undefined ? existing.notes : payload.notes
      }
    });
    res.json({ id: updated.id });
  } catch (error) {
    next(error);
  }
});

mdcRouter.delete('/expenses/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamsSchema.parse(req.params);
    const deleted = await prisma.genericExpense.deleteMany({ where: { id, userId: req.userId } });
    if (deleted.count === 0) return res.status(404).json({ error: 'Dépense introuvable.' });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// --- Référentiels: Plan de comptes & Classes CCA ---

// GET plan de comptes (global + spécifique user)
mdcRouter.get('/reference/accounts', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const accounts = await prisma.account.findMany({
      where: { OR: [{ userId: null }, { userId: req.userId! }] },
      orderBy: [{ code: 'asc' }]
    });
    res.json(
      accounts.map((a) => ({
        id: a.id,
        userId: a.userId ?? null,
        code: a.code,
        name: a.name,
        type: a.type,
        parentCode: a.parentCode ?? null,
        isActive: a.isActive,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString()
      }))
    );
  } catch (error) {
    next(error);
  }
});

// Vérification de cohérence: toutes les lignes d'écritures référencent un compte existant
mdcRouter.get('/reference/accounts/coherence', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const accounts = await prisma.account.findMany({
      where: { OR: [{ userId: null }, { userId: req.userId! }] },
      select: { code: true }
    });
    const known = new Set(accounts.map((a) => a.code));

    const lines = await prisma.journalEntryLine.findMany({
      where: { entry: { userId: req.userId! } },
      select: { accountCode: true }
    });

    const unknown = Array.from(new Set(lines.map((l) => l.accountCode).filter((c) => !known.has(c))));

    res.json({ ok: unknown.length === 0, unknownAccountCodes: unknown });
  } catch (error) {
    next(error);
  }
});

// GET classes CCA (global + spécifique user)
mdcRouter.get('/reference/cca-classes', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const classes = await prisma.cCAClass.findMany({
      where: { OR: [{ userId: null }, { userId: req.userId! }] },
      orderBy: [{ classCode: 'asc' }]
    });
    res.json(
      classes.map((c) => ({
        id: c.id,
        userId: c.userId ?? null,
        classCode: c.classCode,
        description: c.description ?? null,
        rate: Number(c.rate),
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString()
      }))
    );
  } catch (error) {
    next(error);
  }
});

// --- Référentiel: Mapping fiscal -> compte ---

const taxMappingQuerySchema = z.object({
  form: z.string().trim().default('T776'),
  jurisdiction: optionalString
});

// Liste du mapping (global + user)
mdcRouter.get('/reference/tax-mapping', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const q = taxMappingQuerySchema.parse({
      form: req.query.form ?? 'T776',
      jurisdiction: req.query.jurisdiction
    });

    const maps = await prisma.taxLineToAccountMap.findMany({
      where: {
        form: q.form,
        jurisdiction: q.jurisdiction ?? undefined,
        OR: [{ userId: null }, { userId: req.userId! }]
      },
      orderBy: [{ lineCode: 'asc' }]
    });
    res.json(
      maps.map((m) => ({
        id: m.id,
        userId: m.userId ?? null,
        form: m.form,
        jurisdiction: m.jurisdiction ?? null,
        lineCode: m.lineCode,
        lineLabel: m.lineLabel ?? null,
        accountCode: m.accountCode,
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString()
      }))
    );
  } catch (error) {
    next(error);
  }
});

// Couverture minimale T776
const REQUIRED_T776 = [
  'RENTAL_INCOME',
  'PROPERTY_TAXES',
  'INSURANCE',
  'MAINTENANCE',
  'INTEREST',
  'UTILITIES',
  'ADVERTISING',
  'MANAGEMENT_FEES'
];

mdcRouter.get(
  '/reference/tax-mapping/coverage',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const q = taxMappingQuerySchema.parse({
        form: req.query.form ?? 'T776',
        jurisdiction: req.query.jurisdiction
      });

      const maps = await prisma.taxLineToAccountMap.findMany({
        where: {
          form: q.form,
          jurisdiction: q.jurisdiction ?? undefined,
          OR: [{ userId: null }, { userId: req.userId! }]
        },
        select: { lineCode: true }
      });
      const have = new Set(maps.map((m) => m.lineCode));
      const required = q.form === 'T776' ? REQUIRED_T776 : [];
      const missing = required.filter((r) => !have.has(r));
      res.json({ ok: missing.length === 0, requiredCount: required.length, missing });
    } catch (error) {
      next(error);
    }
  }
);
