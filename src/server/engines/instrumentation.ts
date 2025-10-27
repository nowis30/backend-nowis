import { performance } from 'node:perf_hooks';

import { logger } from '../lib/logger';

export interface EngineInstrumentationOptions {
  engineId: string;
  action: string;
  userId?: number;
  metadata?: Record<string, unknown>;
}

export interface EngineInvocationMetric {
  engineId: string;
  action: string;
  durationMs: number;
  success: boolean;
  timestamp: string;
  userId?: number;
  metadata?: Record<string, unknown>;
  errorName?: string;
  errorMessage?: string;
}

export interface EngineMetricsAggregate {
  engineId: string;
  action: string;
  count: number;
  successCount: number;
  failureCount: number;
  totalDurationMs: number;
  maxDurationMs: number;
  lastErrorTimestamp?: string;
  lastErrorName?: string;
}

const metricsStore = new Map<string, EngineMetricsAggregate>();

function storeMetric(metric: EngineInvocationMetric) {
  const key = `${metric.engineId}::${metric.action}`;
  const existing = metricsStore.get(key);

  if (!existing) {
    metricsStore.set(key, {
      engineId: metric.engineId,
      action: metric.action,
      count: 1,
      successCount: metric.success ? 1 : 0,
      failureCount: metric.success ? 0 : 1,
      totalDurationMs: metric.durationMs,
      maxDurationMs: metric.durationMs,
      lastErrorTimestamp: metric.success ? undefined : metric.timestamp,
      lastErrorName: metric.success ? undefined : metric.errorName
    });
    return;
  }

  existing.count += 1;
  if (metric.success) {
    existing.successCount += 1;
  } else {
    existing.failureCount += 1;
    existing.lastErrorTimestamp = metric.timestamp;
    existing.lastErrorName = metric.errorName;
  }
  existing.totalDurationMs += metric.durationMs;
  existing.maxDurationMs = Math.max(existing.maxDurationMs, metric.durationMs);
}

export function getEngineMetricsSnapshot(): EngineMetricsAggregate[] {
  return Array.from(metricsStore.values()).map((metric) => ({ ...metric }));
}

export async function instrumentEngineExecution<T>(
  options: EngineInstrumentationOptions,
  handler: () => Promise<T>,
  enrichSuccessMetadata?: (result: T) => Record<string, unknown> | undefined
): Promise<T> {
  const start = performance.now();
  const startTimestamp = new Date().toISOString();

  logger.debug({
    engineId: options.engineId,
    action: options.action,
    userId: options.userId,
    metadata: options.metadata
  }, 'Engine execution started');

  try {
    const result = await handler();
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    const dynamicMetadata = enrichSuccessMetadata?.(result);
    const metadata = options.metadata
      ? dynamicMetadata
        ? { ...options.metadata, ...dynamicMetadata }
        : options.metadata
      : dynamicMetadata;

    const metric: EngineInvocationMetric = {
      engineId: options.engineId,
      action: options.action,
      durationMs,
      success: true,
      timestamp: startTimestamp,
      userId: options.userId,
      metadata
    };

    storeMetric(metric);

    logger.info({
      engineId: options.engineId,
      action: options.action,
      durationMs,
      userId: options.userId,
      metadata
    }, 'Engine execution succeeded');

    return result;
  } catch (error) {
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    const errorObject = error instanceof Error ? { name: error.name, message: error.message } : { name: 'Error', message: String(error) };

    const metric: EngineInvocationMetric = {
      engineId: options.engineId,
      action: options.action,
      durationMs,
      success: false,
      timestamp: startTimestamp,
      userId: options.userId,
      metadata: options.metadata,
      errorName: errorObject.name,
      errorMessage: errorObject.message
    };

    storeMetric(metric);

    logger.error({
      engineId: options.engineId,
      action: options.action,
      durationMs,
      userId: options.userId,
      metadata: options.metadata,
      error: errorObject
    }, 'Engine execution failed');

    throw error;
  }
}
