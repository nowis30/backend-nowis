import { env } from '../env';
import { prisma } from '../lib/prisma';

function getDelegates() {
  const client = prisma as unknown as Record<string, unknown>;
  return {
    user: client['user'] as { findUnique: (args: unknown) => Promise<unknown> },
    alertRule: client['alertRule'] as { findFirst: (args: unknown) => Promise<unknown> },
    alertEvent: client['alertEvent'] as { create: (args: unknown) => Promise<unknown> }
  };
}

async function fetchHealth(): Promise<number> {
  const url = `http://127.0.0.1:${env.PORT}/health`;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res.status;
  } catch (_err) {
    return 0;
  } finally {
    clearTimeout(id);
  }
}

async function getMonitorContext() {
  const { user } = getDelegates();
  const email = env.MONITOR_USER_EMAIL;
  if (!email) return undefined;
  const found = (await user.findUnique({ where: { email } })) as undefined | { id: number };
  if (!found) return undefined;
  return { userId: found.id };
}

export function startMonitoringJobs() {
  if (!env.ENABLE_MONITORING_JOBS) return;

  const intervalSec = Math.max(15, env.MONITOR_HEALTH_INTERVAL_SECONDS);
  const _timer: NodeJS.Timeout | undefined = undefined;

  const tick = async () => {
    const ctx = await getMonitorContext();
    if (!ctx) return;

    const status = await fetchHealth();
    if (status !== 200) {
      const { alertRule, alertEvent } = getDelegates();
      const rule = (await alertRule.findFirst({
        where: { userId: ctx.userId, isActive: true, triggerType: 'HEALTH_CHECK' },
        orderBy: { updatedAt: 'desc' }
      })) as undefined | { id: number };
      if (rule) {
        await alertEvent.create({
          data: {
            userId: ctx.userId,
            ruleId: rule.id,
            status: 'TRIGGERED',
            payload: { status, at: new Date().toISOString() }
          }
        });
      }
    }
  };

  setInterval(tick, intervalSec * 1000);
}
