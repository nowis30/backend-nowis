import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';

import { authenticated, AuthenticatedRequest } from '../middlewares/authenticated';
import {
  buildShareholderHistory,
  buildValuationSnapshotCsv,
  createValuationSnapshot,
  deleteValuationSnapshot,
  getValuationSnapshot,
  listValuationSnapshots
} from '../services/valuationEngineService';
import { generateValuationReportPdf } from '../services/pdfService';

const valuationRouter = Router();

const optionalDate = z
  .preprocess((value) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    if (value instanceof Date) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    return value;
  }, z.date())
  .optional();

const optionalLongText = z
  .preprocess((value) => {
    if (value === undefined || value === null) {
      return undefined;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length ? trimmed : undefined;
    }

    return value;
  }, z.string().max(5000))
  .optional();

const createSnapshotBodySchema = z.object({
  companyId: z.coerce.number().int().positive(),
  valuationDate: optionalDate,
  notes: optionalLongText
});

const snapshotParamsSchema = z.object({
  id: z.coerce.number().int().positive()
});

const listQuerySchema = z.object({
  companyId: z.coerce.number().int().positive().optional()
});

valuationRouter.use(authenticated);

valuationRouter.get('/snapshots', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { companyId } = listQuerySchema.parse(req.query);
    const snapshots = await listValuationSnapshots(req.userId!, companyId);
    res.json(snapshots);
  } catch (error) {
    next(error);
  }
});

valuationRouter.post('/snapshots', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const payload = createSnapshotBodySchema.parse(req.body);
    const snapshot = await createValuationSnapshot({
      userId: req.userId!,
      companyId: payload.companyId,
      valuationDate: payload.valuationDate,
      notes: payload.notes ?? null
    });

    res.status(201).json(snapshot);
  } catch (error) {
    next(error);
  }
});

valuationRouter.get('/snapshots/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = snapshotParamsSchema.parse(req.params);
    const snapshot = await getValuationSnapshot(req.userId!, id);

    if (!snapshot) {
      return res.status(404).json({ error: 'Instantané de valorisation introuvable.' });
    }

    res.json(snapshot);
  } catch (error) {
    next(error);
  }
});

valuationRouter.delete('/snapshots/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = snapshotParamsSchema.parse(req.params);
    const deleted = await deleteValuationSnapshot(req.userId!, id);

    if (!deleted) {
      return res.status(404).json({ error: 'Instantané de valorisation introuvable.' });
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

valuationRouter.post('/snapshots/:id/export/pdf', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = snapshotParamsSchema.parse(req.params);
    const snapshot = await getValuationSnapshot(req.userId!, id);

    if (!snapshot) {
      return res.status(404).json({ error: 'Instantané de valorisation introuvable.' });
    }

    const pdfBuffer = await generateValuationReportPdf(snapshot);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="valuation-${id}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
});

valuationRouter.post('/snapshots/:id/export/csv', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = snapshotParamsSchema.parse(req.params);
    const snapshot = await getValuationSnapshot(req.userId!, id);

    if (!snapshot) {
      return res.status(404).json({ error: 'Instantané de valorisation introuvable.' });
    }

    const csv = buildValuationSnapshotCsv(snapshot);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="valuation-${id}.csv"`);
    res.send(csv);
  } catch (error) {
    next(error);
  }
});

valuationRouter.get('/history/shareholders', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { companyId } = listQuerySchema.parse(req.query);
    const snapshots = await listValuationSnapshots(req.userId!, companyId);
    const history = buildShareholderHistory(snapshots);

    const timeline = snapshots
      .slice()
      .sort((a, b) => new Date(a.valuationDate).getTime() - new Date(b.valuationDate).getTime())
      .map((snapshot) => ({
        id: snapshot.id,
        companyId: snapshot.companyId,
        companyName: snapshot.companyName,
        valuationDate: snapshot.valuationDate,
        netAssetValue: snapshot.totals.netAssetValue
      }));

    res.json({ history, timeline });
  } catch (error) {
    next(error);
  }
});

export { valuationRouter };
