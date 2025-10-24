import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { prisma } from '../lib/prisma';
import { authenticated } from '../middlewares/authenticated';
import { requireRole } from '../middlewares/requireRole';

const router = Router();

const idParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

const userRoleSchema = z.object({
  userId: z.coerce.number().int().positive(),
  roleId: z.coerce.number().int().positive(),
  companyId: z
    .union([z.coerce.number().int().positive(), z.null()])
    .optional()
});

router.use(authenticated);
router.use(requireRole('ADMIN'));

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const userRoles = await prisma.userRole.findMany({
      include: { user: true, role: true, company: true },
      orderBy: [{ user: { email: 'asc' } }, { role: { name: 'asc' } }]
    });
    res.json(userRoles);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = userRoleSchema.parse(req.body);
    const created = await prisma.userRole.create({
      data: { userId: body.userId, roleId: body.roleId, companyId: body.companyId ?? null },
      include: { user: true, role: true, company: true }
    });
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const body = userRoleSchema.parse(req.body);
    const updated = await prisma.userRole.update({
      where: { id },
      data: { userId: body.userId, roleId: body.roleId, companyId: body.companyId ?? null },
      include: { user: true, role: true, company: true }
    });
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    await prisma.userRole.delete({ where: { id } });
    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});

export const userRolesRouter = router;
