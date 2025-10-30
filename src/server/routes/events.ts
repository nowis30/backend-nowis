import { Router } from 'express';
import { z } from 'zod';
import { getRecentEvents } from '../lib/events';
import { authenticated } from '../middlewares/authenticated';

const eventsRouter = Router();

eventsRouter.use(authenticated);

const qSchema = z.object({ limit: z.coerce.number().int().positive().max(200).optional() });

eventsRouter.get('/recent', (req, res) => {
  const { limit } = qSchema.parse(req.query);
  res.json(getRecentEvents(limit));
});

export { eventsRouter };
