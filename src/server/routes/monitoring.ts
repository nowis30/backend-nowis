import { Router, Response } from 'express';
import { z } from 'zod';

import { authenticated, AuthenticatedRequest } from '../middlewares/authenticated';
import { prisma } from '../lib/prisma';

const monitoringRouter = Router();
monitoringRouter.use(authenticated);

function getDelegates() {
  const client = prisma as unknown as Record<string, unknown>;
  return {
    alertRule: client['alertRule'] as {
      findMany: (args: unknown) => Promise<unknown>;
      create: (args: unknown) => Promise<unknown>;
      findFirst: (args: unknown) => Promise<unknown>;
      update: (args: unknown) => Promise<unknown>;
      delete: (args: unknown) => Promise<unknown>;
    },
    alertEvent: client['alertEvent'] as {
      findMany: (args: unknown) => Promise<unknown>;
    },
    notification: client['notification'] as {
      findMany: (args: unknown) => Promise<unknown>;
    }
  };
}

// Schemas
const ruleUpsertSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  isActive: z.boolean().optional().default(true),
  severity: z.enum(['INFO', 'WARNING', 'CRITICAL']).optional().default('INFO'),
  triggerType: z.string().min(1),
  condition: z.unknown()
});

// Rules
monitoringRouter.get('/rules', async (req: AuthenticatedRequest, res: Response) => {
  const { alertRule } = getDelegates();
  const rules = (await alertRule.findMany({
    where: { userId: req.userId! },
    orderBy: [{ updatedAt: 'desc' }]
  })) as unknown[];
  res.json(rules);
});

monitoringRouter.post('/rules', async (req: AuthenticatedRequest, res: Response) => {
  const input = ruleUpsertSchema.parse(req.body);
  const { alertRule } = getDelegates();
  const rule = await alertRule.create({
    data: {
      userId: req.userId!,
      name: input.name,
      description: input.description,
      isActive: input.isActive,
      severity: input.severity,
      triggerType: input.triggerType,
      condition: input.condition
    }
  });
  res.status(201).json(rule);
});

monitoringRouter.put('/rules/:id', async (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'id invalide' });
  const { alertRule } = getDelegates();
  const existing = (await alertRule.findFirst({ where: { id, userId: req.userId! } })) as
    | { id: number; name: string; description?: string | null; isActive: boolean; severity: string; triggerType: string; condition: unknown }
    | null;
  if (!existing) return res.status(404).json({ error: 'Règle introuvable' });
  const input = ruleUpsertSchema.partial().parse(req.body);
  const updated = await alertRule.update({
    where: { id },
    data: {
      name: input.name ?? existing.name,
      description: input.description ?? existing.description,
      isActive: input.isActive ?? existing.isActive,
      severity: input.severity ?? existing.severity,
      triggerType: input.triggerType ?? existing.triggerType,
      condition: input.condition ?? existing.condition
    }
  });
  res.json(updated);
});

monitoringRouter.delete('/rules/:id', async (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'id invalide' });
  const { alertRule } = getDelegates();
  const existing = await alertRule.findFirst({ where: { id, userId: req.userId! } });
  if (!existing) return res.status(404).json({ error: 'Règle introuvable' });
  await alertRule.delete({ where: { id } });
  res.status(204).send();
});

// Events
const eventsQuerySchema = z.object({
  status: z.enum(['TRIGGERED', 'RESOLVED', 'ACKNOWLEDGED']).optional(),
  ruleId: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => (v === undefined || v === '' ? undefined : Number(v)))
});

monitoringRouter.get('/events', async (req: AuthenticatedRequest, res: Response) => {
  const parsed = eventsQuerySchema.safeParse(req.query);
  type EventsWhere = { userId: number; status?: 'TRIGGERED' | 'RESOLVED' | 'ACKNOWLEDGED'; ruleId?: number };
  const where: EventsWhere = { userId: req.userId! };
  if (parsed.success) {
    const q = parsed.data as { status?: EventsWhere['status']; ruleId?: number };
    if (q.status) where.status = q.status;
    if (q.ruleId !== undefined && Number.isFinite(q.ruleId)) where.ruleId = q.ruleId;
  }
  const { alertEvent } = getDelegates();
  const events = await alertEvent.findMany({
    where,
    orderBy: [{ triggeredAt: 'desc' }],
    take: 100
  });
  res.json(events);
});

// Notifications
monitoringRouter.get('/notifications', async (req: AuthenticatedRequest, res: Response) => {
  const { notification } = getDelegates();
  const notifications = await notification.findMany({
    where: { event: { userId: req.userId! } },
    orderBy: [{ createdAt: 'desc' }],
    take: 100
  });
  res.json(notifications);
});

export { monitoringRouter };
