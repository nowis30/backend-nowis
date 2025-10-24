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

    // Vérifie si l'utilisateur a le rôle demandé (global ou pour une company)
    const userRoles = await prisma.userRole.findMany({
      where: {
        userId,
        role: { name: roleName }
      }
    });
    if (userRoles.length === 0) {
      return res.status(403).json({ error: `Accès refusé, rôle requis : ${roleName}` });
    }
    next();
  };
}
