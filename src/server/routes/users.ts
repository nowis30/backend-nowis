import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';

import { prisma } from '../lib/prisma';
import { authenticated } from '../middlewares/authenticated';
import { requireRole } from '../middlewares/requireRole';

const passwordSchema = z
  .string()
  .min(12, 'Le mot de passe doit contenir au moins 12 caractères.')
  .regex(/[A-Z]/, 'Inclure au moins une lettre majuscule.')
  .regex(/[a-z]/, 'Inclure au moins une lettre minuscule.')
  .regex(/[0-9]/, 'Inclure au moins un chiffre.')
  .regex(/[^A-Za-z0-9]/, 'Inclure au moins un caractère spécial.');

const createUserSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
  roles: z
    .array(
      z.object({
        roleId: z.coerce.number().int().positive(),
        companyId: z.union([z.coerce.number().int().positive(), z.null()]).optional()
      })
    )
    .default([])
});

function serializeUser(user: {
  id: number;
  email: string;
  createdAt: Date;
  updatedAt: Date;
  roles: Array<{
    id: number;
    role: { id: number; name: string };
    company: { id: number; name: string | null } | null;
  }>;
}) {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    roles: user.roles.map((assignment) => ({
      id: assignment.id,
      roleId: assignment.role.id,
      roleName: assignment.role.name,
      companyId: assignment.company?.id ?? null,
      companyName: assignment.company?.name ?? null
    }))
  };
}

const router = Router();

router.use(authenticated);
router.use(requireRole('ADMIN'));

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await prisma.user.findMany({
      include: {
        roles: {
          include: {
            role: true,
            company: { select: { id: true, name: true } }
          }
        }
      },
      orderBy: { email: 'asc' }
    });
    res.json(users.map(serializeUser));
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = createUserSchema.parse(req.body);

    const passwordHash = await bcrypt.hash(payload.password, 12);

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { email: payload.email } });
      if (existing) {
        throw Object.assign(new Error('Utilisateur déjà existant.'), { status: 409 });
      }

      const createdUser = await tx.user.create({
        data: {
          email: payload.email,
          passwordHash
        }
      });

      if (payload.roles.length > 0) {
        for (const assignment of payload.roles) {
          await tx.userRole.create({
            data: {
              userId: createdUser.id,
              roleId: assignment.roleId,
              companyId: assignment.companyId ?? null
            }
          });
        }
      }

      return createdUser.id;
    });

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: result },
      include: {
        roles: {
          include: {
            role: true,
            company: { select: { id: true, name: true } }
          }
        }
      }
    });

    res.status(201).json(serializeUser(user));
  } catch (error) {
    next(error);
  }
});

export const usersRouter = router;
