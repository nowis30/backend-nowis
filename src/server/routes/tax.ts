import { Router } from 'express';
import { z } from 'zod';

import { authenticated, type AuthenticatedRequest } from '../middlewares/authenticated';
import { requireRole } from '../middlewares/requireRole';
import { calculateCorporateTaxReturn } from '../services/tax/corporateTaxEngine';
import { calculatePersonalTaxReturn } from '../services/tax/personalTaxEngine';
import { buildT4Csv, buildRl1Csv, buildT5Csv, buildRl3Csv } from '../services/tax/taxExportService';
import { buildAnnualReport } from '../services/tax/annualReportService';
import { generateAnnualReportPdf } from '../services/pdfService';

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

export const taxRouter = router;
