import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

import { prisma } from '../lib/prisma';
import { env } from '../env';

const authRouter = Router();

const passwordSchema = z
  .string()
  .min(12, 'Le mot de passe doit contenir au moins 12 caractères.')
  .regex(/[A-Z]/, 'Inclure au moins une lettre majuscule.')
  .regex(/[a-z]/, 'Inclure au moins une lettre minuscule.')
  .regex(/[0-9]/, 'Inclure au moins un chiffre.')
  .regex(/[^A-Za-z0-9]/, 'Inclure au moins un caractère spécial.');

// Accepte les emails standards et les domaines internes (.local) utilisés par le seed
const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine(
    (value) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) || /@[^@\s]+\.local$/i.test(value),
    { message: 'Email invalide.' }
  );

const credentialsSchema = z.object({
  email: emailSchema,
  password: passwordSchema
});

function createToken(userId: number) {
  return jwt.sign({ userId }, env.JWT_SECRET, { expiresIn: '7d' });
}

authRouter.post(
  '/register',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const credentials = credentialsSchema.parse(req.body);
      const existing = await prisma.user.findUnique({ where: { email: credentials.email } });

      if (existing) {
        return res.status(409).json({ error: 'Utilisateur déjà inscrit.' });
      }

      const passwordHash = await bcrypt.hash(credentials.password, 12);
      const user = await prisma.user.create({
        data: { email: credentials.email, passwordHash }
      });

      const token = createToken(user.id);
      res.status(201).json({ token });
    } catch (error) {
      next(error);
    }
  }
);

authRouter.post(
  '/login',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const credentials = credentialsSchema.parse(req.body);
      const user = await prisma.user.findUnique({ where: { email: credentials.email } });

      if (!user) {
        return res.status(401).json({ error: 'Identifiants invalides.' });
      }

      const ok = await bcrypt.compare(credentials.password, user.passwordHash);
      if (!ok) {
        return res.status(401).json({ error: 'Identifiants invalides.' });
      }

      const token = createToken(user.id);
      res.json({ token });
    } catch (error) {
      next(error);
    }
  }
);

const tokenPayloadSchema = z.object({
  userId: z.number()
});

authRouter.get('/me', async (req: Request, res: Response) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).json({ error: 'Token absent.' });
  }

  const token = authorization.replace('Bearer ', '');

  try {
    const payload = tokenPayloadSchema.parse(jwt.verify(token, env.JWT_SECRET));
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }
    res.json({ id: user.id, email: user.email });
  } catch (error) {
    res.status(401).json({ error: 'Token invalide.' });
  }
});

export { authRouter };
