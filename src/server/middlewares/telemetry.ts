import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

import { env } from '../env';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

function getDelegates() {
  const client = prisma as unknown as Record<string, unknown>;
  return {
    alertRule: client['alertRule'] as {
      findFirst: (args: unknown) => Promise<unknown>;
    },
    alertEvent: client['alertEvent'] as {
      create: (args: unknown) => Promise<unknown>;
    },
    notification: client['notification'] as {
      create: (args: unknown) => Promise<unknown>;
    }
  };
}

function extractUserIdFromAuthHeader(req: Request): number | undefined {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return undefined;
  const token = auth.slice('Bearer '.length);
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { userId?: number };
    return payload.userId;
  } catch (_err) {
    return undefined;
  }
}

export function telemetry(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();
  const userId = extractUserIdFromAuthHeader(req);

  res.on('finish', async () => {
    // Ignore health endpoints to avoid noise
    const path = req.originalUrl || req.url;
    if (path.includes('/health')) return;

    const durationNs = Number(process.hrtime.bigint() - start);
    const durationMs = Math.round(durationNs / 1_000_000);
    const status = res.statusCode;

    // No user context → skip (schema requires userId)
    if (!userId) {
      logger.debug({ path, status }, 'telemetry: skip (no userId)');
      return;
    }

  const { alertRule, alertEvent, notification } = getDelegates();

    try {
      // Slow request
      const slowRule = (await alertRule.findFirst({
        where: { userId, isActive: true, triggerType: 'SLOW_REQUEST' },
        orderBy: { updatedAt: 'desc' }
      })) as
        | undefined
        | { id: number; condition?: { thresholdMs?: number } };

      if (slowRule) {
        const thresholdMs = Number(slowRule.condition?.thresholdMs ?? 2000);
        if (Number.isFinite(thresholdMs) && durationMs > thresholdMs) {
          const ev = (await alertEvent.create({
            data: {
              userId,
              ruleId: slowRule.id,
              status: 'TRIGGERED',
              payload: { path, status, durationMs }
            }
          })) as { id: number };
          // Create a LOG notification to surface visibility in listings
          await notification.create({
            data: {
              eventId: ev.id,
              channel: 'LOG',
              target: null,
              status: 'SENT',
              sentAt: new Date()
            }
          });
          logger.info({ path, status, durationMs, ruleId: slowRule.id, ev }, 'telemetry: slow request event created');
        }
      }

      // Leverage errors on simulate
      const isLeverageSimulate = path.includes('/api/leverage/simulate');
      if (isLeverageSimulate && status >= 400) {
        const levRule = (await alertRule.findFirst({
          where: { userId, isActive: true, triggerType: 'LEVERAGE_ERROR' },
          orderBy: { updatedAt: 'desc' }
        })) as undefined | { id: number };
        if (levRule) {
          const ev = (await alertEvent.create({
            data: {
              userId,
              ruleId: levRule.id,
              status: 'TRIGGERED',
              payload: { path, status }
            }
          })) as { id: number };
          await notification.create({
            data: {
              eventId: ev.id,
              channel: 'LOG',
              target: null,
              status: 'SENT',
              sentAt: new Date()
            }
          });
          logger.info({ path, status, ruleId: levRule.id, ev }, 'telemetry: leverage error event created');
        }
      }
    } catch (err) {
      // Best effort only, never block response lifecycle — but log for visibility
      logger.warn({ err, path, status, userId }, 'telemetry: failed to persist event');
    }
  });

  next();
}
