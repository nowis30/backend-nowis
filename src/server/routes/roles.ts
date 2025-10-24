import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { prisma } from '../lib/prisma';
import { authenticated } from '../middlewares/authenticated';
import { requireRole } from '../middlewares/requireRole';

const roleSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Le nom du rôle est requis.')
});

const idParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

const router = Router();

router.use(authenticated);
router.use(requireRole('ADMIN'));

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const roles = await prisma.role.findMany({ orderBy: { name: 'asc' } });
    res.json(roles);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = roleSchema.parse(req.body);
    const role = await prisma.role.create({ data: { name: body.name } });
    res.status(201).json(role);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const body = roleSchema.parse(req.body);
    const role = await prisma.role.update({ where: { id }, data: { name: body.name } });
    res.json(role);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    await prisma.role.delete({ where: { id } });
    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});

export const rolesRouter = router;
