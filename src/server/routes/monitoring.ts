import { Router, Response, NextFunction } from 'express';

import { authenticated, AuthenticatedRequest } from '../middlewares/authenticated';

// Placeholder CRUD pour monitoring: retourne 501 tant que le schéma n'est pas déployé.
// Permet d'intégrer côté front et d'ajouter la télémétrie plus tard sans casser le déploiement.

const monitoringRouter = Router();
monitoringRouter.use(authenticated);

monitoringRouter.get('/rules', (_req: AuthenticatedRequest, res: Response) => {
  res.status(501).json({ error: 'Monitoring.rules non implémenté (schéma à déployer).' });
});

monitoringRouter.post('/rules', (_req: AuthenticatedRequest, res: Response) => {
  res.status(501).json({ error: 'Monitoring.rules create non implémenté (schéma à déployer).' });
});

monitoringRouter.put('/rules/:id', (_req: AuthenticatedRequest, res: Response) => {
  res.status(501).json({ error: 'Monitoring.rules update non implémenté (schéma à déployer).' });
});

monitoringRouter.delete('/rules/:id', (_req: AuthenticatedRequest, res: Response) => {
  res.status(501).json({ error: 'Monitoring.rules delete non implémenté (schéma à déployer).' });
});

monitoringRouter.get('/events', (_req: AuthenticatedRequest, res: Response) => {
  res.status(501).json({ error: 'Monitoring.events non implémenté (schéma à déployer).' });
});

monitoringRouter.get('/notifications', (_req: AuthenticatedRequest, res: Response) => {
  res.status(501).json({ error: 'Monitoring.notifications non implémenté (schéma à déployer).' });
});

export { monitoringRouter };
