import { Request, Response, NextFunction } from 'express';

import { prisma } from '../lib/prisma';

interface RequestWithUser extends Request {
  userId?: number;
}

export function requireRole(roleName: string) {
  return async (req: RequestWithUser, res: Response, next: NextFunction) => {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Utilisateur non authentifié.' });
    }

    // Administrative routes require a global grant. A company-scoped role
    // must never authorize cross-company user or role management.
    const userRoles = await prisma.userRole.findMany({
      where: {
        userId,
        companyId: null,
        role: { name: roleName }
      }
    });
    if (userRoles.length === 0) {
      return res.status(403).json({ error: `Accès refusé, rôle requis : ${roleName}` });
    }
    next();
  };
}
