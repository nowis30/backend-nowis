import { Router } from 'express';
import { z } from 'zod';
import { authenticated } from '../middlewares/authenticated';
import { nodes, impactedNodesFrom, recordRun, recentRuns, type DagNodeId, computeOrderAndRecord, getLastOutputs } from '../lib/dag';
import { publish } from '../lib/events';

const graphRouter = Router();
graphRouter.use(authenticated);

graphRouter.get('/nodes', (_req, res) => {
  res.json({ nodes });
});

const recalcSchema = z.object({ source: z.enum(['Tax', 'Immobilier', 'Compta', 'Previsions', 'Decideur']) });

graphRouter.post('/recalc', (req, res) => {
  const { source } = recalcSchema.parse(req.body);
  const order = impactedNodesFrom(source as DagNodeId);
  const run = { at: new Date().toISOString(), source: source as DagNodeId, order };
  recordRun(run);
  const outputs = computeOrderAndRecord(order);
  for (const n of order) publish({ type: `${n}.Updated`, at: run.at });
  res.json({ ...run, outputs });
});

graphRouter.get('/runs', (_req, res) => {
  res.json(recentRuns());
});

graphRouter.get('/outputs', (_req, res) => {
  res.json(getLastOutputs());
});

export { graphRouter };
