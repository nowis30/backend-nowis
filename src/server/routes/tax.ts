import { Router } from 'express';
import { z } from 'zod';
import { RentalTaxFormType } from '@prisma/client';

import { authenticated, type AuthenticatedRequest } from '../middlewares/authenticated';
import { requireRole } from '../middlewares/requireRole';
import { calculateCorporateTaxReturn } from '../services/tax/corporateTaxEngine';
import { calculatePersonalTaxReturn } from '../services/tax/personalTaxEngine';
import { buildT4Csv, buildRl1Csv, buildT5Csv, buildRl3Csv } from '../services/tax/taxExportService';
import { buildAnnualReport } from '../services/tax/annualReportService';
import { generateAnnualReportPdf, generateRentalTaxStatementPdf } from '../services/pdfService';
import {
  prepareRentalTaxStatement,
  createRentalTaxStatement,
  listRentalTaxStatements,
  getRentalTaxStatement
} from '../services/rentalTaxService';

const router = Router();

router.use(authenticated);
router.use(requireRole('ADMIN'));

const corporateInputSchema = z.object({
  companyId: z.number().int().positive(),
  fiscalYearEnd: z.string().datetime()
});

router.post('/corporate-tax', async (req: AuthenticatedRequest, res, next) => {
  try {
    const payload = corporateInputSchema.parse(req.body);
    const result = await calculateCorporateTaxReturn(payload.companyId, new Date(payload.fiscalYearEnd));
    res.json(result);
  } catch (error) {
    next(error);
  }
});

const personalInputSchema = z.object({
  shareholderId: z.number().int().positive(),
  taxYear: z.number().int().min(2000).max(new Date().getFullYear() + 1),
  employmentIncome: z.number().min(0).optional(),
  businessIncome: z.number().min(0).optional(),
  eligibleDividends: z.number().min(0).optional(),
  nonEligibleDividends: z.number().min(0).optional(),
  capitalGains: z.number().min(0).optional(),
  deductions: z.number().min(0).optional(),
  otherCredits: z.number().min(0).optional(),
  province: z.string().max(32).optional()
});

router.post('/personal-tax', async (req: AuthenticatedRequest, res, next) => {
  try {
    const payload = personalInputSchema.parse(req.body);
    const result = await calculatePersonalTaxReturn(payload);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/exports/t5', async (req: AuthenticatedRequest, res, next) => {
  try {
    const year = Number(req.query.year ?? new Date().getFullYear());
    const csv = await buildT5Csv(req.userId!, year);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="t5-${year}.csv"`);
    res.send(`\uFEFF${csv}`);
  } catch (error) {
    next(error);
  }
});

router.get('/exports/rl3', async (req: AuthenticatedRequest, res, next) => {
  try {
    const year = Number(req.query.year ?? new Date().getFullYear());
    const csv = await buildRl3Csv(req.userId!, year);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="rl3-${year}.csv"`);
    res.send(`\uFEFF${csv}`);
  } catch (error) {
    next(error);
  }
});

router.get('/exports/t4', async (req: AuthenticatedRequest, res, next) => {
  try {
    const year = Number(req.query.year ?? new Date().getFullYear());
    const csv = await buildT4Csv(req.userId!, year);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="t4-${year}.csv"`);
    res.send(`\uFEFF${csv}`);
  } catch (error) {
    next(error);
  }
});

router.get('/exports/rl1', async (req: AuthenticatedRequest, res, next) => {
  try {
    const year = Number(req.query.year ?? new Date().getFullYear());
    const csv = await buildRl1Csv(req.userId!, year);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="rl1-${year}.csv"`);
    res.send(`\uFEFF${csv}`);
  } catch (error) {
    next(error);
  }
});

router.get('/annual-report', async (req: AuthenticatedRequest, res, next) => {
  try {
    const year = Number(req.query.year ?? new Date().getFullYear());
    const data = await buildAnnualReport(req.userId!, year);
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.get('/annual-report/pdf', async (req: AuthenticatedRequest, res, next) => {
  try {
    const year = Number(req.query.year ?? new Date().getFullYear());
    const data = await buildAnnualReport(req.userId!, year);
    const pdf = await generateAnnualReportPdf(data);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="rapport-annuel-${year}.pdf"`);
    res.send(pdf);
  } catch (error) {
    next(error);
  }
});

const rentalBaseSchema = z.object({
  taxYear: z.number().int().min(2000).max(new Date().getFullYear() + 1),
  formType: z.nativeEnum(RentalTaxFormType),
  propertyId: z.number().int().positive().optional().nullable()
});

const rentalExpenseSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  amount: z.coerce.number(),
  category: z.string().max(255).nullable().optional()
});

const rentalPayloadSchema = z.object({
  income: z.object({
    grossRents: z.coerce.number().min(0),
    otherIncome: z.coerce.number().min(0),
    totalIncome: z.coerce.number().min(0)
  }),
  expenses: z.array(rentalExpenseSchema).default([]),
  totals: z.object({
    totalExpenses: z.coerce.number().min(0),
    netIncome: z.coerce.number()
  })
});

const rentalCreateSchema = rentalBaseSchema.extend({
  payload: rentalPayloadSchema,
  notes: z.string().trim().max(4000).optional().nullable()
});

router.get('/rental-statements', async (req: AuthenticatedRequest, res, next) => {
  try {
    const statements = await listRentalTaxStatements(req.userId!);
    res.json(statements);
  } catch (error) {
    next(error);
  }
});

router.post('/rental-statements/prepare', async (req: AuthenticatedRequest, res, next) => {
  try {
    const payload = rentalBaseSchema.parse(req.body);
    const result = await prepareRentalTaxStatement(req.userId!, {
      taxYear: payload.taxYear,
      formType: payload.formType,
      propertyId: payload.propertyId ?? null
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/rental-statements', async (req: AuthenticatedRequest, res, next) => {
  try {
    const payload = rentalCreateSchema.parse(req.body);
    const result = await createRentalTaxStatement(req.userId!, {
      taxYear: payload.taxYear,
      formType: payload.formType,
      propertyId: payload.propertyId ?? null,
      payload: payload.payload,
      notes: payload.notes ?? null
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/rental-statements/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Identifiant invalide.' });
    }

    const statement = await getRentalTaxStatement(req.userId!, id);
    if (!statement) {
      return res.status(404).json({ error: 'Déclaration introuvable.' });
    }

    res.json(statement);
  } catch (error) {
    next(error);
  }
});

router.get('/rental-statements/:id/pdf', async (req: AuthenticatedRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Identifiant invalide.' });
    }

    const statement = await getRentalTaxStatement(req.userId!, id);
    if (!statement) {
      return res.status(404).json({ error: 'Déclaration introuvable.' });
    }

    const pdf = await generateRentalTaxStatementPdf({
      formType: statement.formType,
      taxYear: statement.taxYear,
      propertyName: statement.propertyName,
      propertyAddress: statement.propertyAddress,
      payload: statement.payload,
      computed: statement.computed,
      notes: statement.notes ?? null,
      generatedAt: new Date().toISOString()
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${statement.formType.toLowerCase()}-${statement.taxYear}.pdf"`
    );
    res.send(pdf);
  } catch (error) {
    next(error);
  }
});

export const taxRouter = router;
