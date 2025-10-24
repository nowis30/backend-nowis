import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import rateLimit from 'express-rate-limit';

import { routes } from './routes/index';
import { errorHandler } from './middlewares/errorHandler';

const app = express();

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: 'Trop de requêtes, réessayez plus tard.'
});

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(pinoHttp());

app.use('/api', apiLimiter, routes);

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

app.use(errorHandler);

export { app };
