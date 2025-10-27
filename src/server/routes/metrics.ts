import { Router } from 'express';

import { getEngineMetricsSnapshot } from '../engines/instrumentation';

const metricsRouter = Router();

metricsRouter.get('/', (_req, res) => {
  const metrics = getEngineMetricsSnapshot();
  res.json(metrics);
});

export { metricsRouter };
