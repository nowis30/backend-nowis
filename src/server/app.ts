import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import rateLimit from 'express-rate-limit';

import { routes } from './routes/index';
import { logger } from './lib/logger';
import { errorHandler } from './middlewares/errorHandler';
import { telemetry } from './middlewares/telemetry';

const app = express();

// Derrière le proxy de Render/Cloudflare, il faut activer "trust proxy"
// pour que express-rate-limit et les IP clientes fonctionnent correctement.
// Voir: https://express-rate-limit.github.io/ERR_ERL_UNEXPECTED_X_FORWARDED_FOR/
app.set('trust proxy', 1);

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
app.use(pinoHttp({ logger }));
app.use(telemetry);

app.use('/api', apiLimiter, routes);

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// Alias pratique: certaines intégrations testent /api/health
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

app.use(errorHandler);

export { app };
