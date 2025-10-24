import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

import { env } from '../env';

const payloadSchema = z.object({
  userId: z.number()
});

export interface AuthenticatedRequest extends Request {
  userId?: number;
}

export function authenticated(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).json({ error: 'Token requis.' });
  }

  const token = authorization.replace('Bearer ', '');
  try {
    const payload = payloadSchema.parse(jwt.verify(token, env.JWT_SECRET));
    req.userId = payload.userId;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token invalide.' });
  }
}
