import { Router } from 'express';
import { z } from 'zod';
import { authenticated } from '../middlewares/authenticated';
import { nodes, impactedNodesFrom, recordRun, recentRuns, type DagNodeId, runComputeOrder, getLastOutputs, type ComputeContext } from '../lib/dag';
import { publish } from '../lib/events';

const graphRouter = Router();
graphRouter.use(authenticated);

graphRouter.get('/nodes', (_req, res) => {
  res.json({ nodes });
});

const recalcSchema = z.object({
  source: z.enum(['Tax', 'Immobilier', 'Compta', 'Previsions', 'Decideur']),
  year: z.number().int().optional()
});

graphRouter.post('/recalc', async (req, res) => {
  const { source, year } = recalcSchema.parse(req.body);
  const order = impactedNodesFrom(source as DagNodeId);
  const run = { at: new Date().toISOString(), source: source as DagNodeId, order };
  recordRun(run);
  const ctx: ComputeContext = { userId: (req as any).userId!, year };
  const outputs = await runComputeOrder(order, ctx);
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
