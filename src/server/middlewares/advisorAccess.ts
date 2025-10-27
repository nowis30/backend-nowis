import { timingSafeEqual } from 'crypto';

import { type NextFunction, type Response } from 'express';

import { env } from '../env';
import { authenticated, type AuthenticatedRequest } from './authenticated';

const HEADER_NAME = 'x-advisor-portal-key';

function hasValidPortalKey(req: AuthenticatedRequest): boolean {
  const configuredKey = env.ADVISOR_PORTAL_API_KEY?.trim();
  if (!configuredKey) {
    return false;
  }

  const provided = req.header(HEADER_NAME)?.trim();
  if (!provided) {
    return false;
  }

  const expectedBuffer = Buffer.from(configuredKey);
  const providedBuffer = Buffer.from(provided);

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

export function advisorAccess(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (hasValidPortalKey(req)) {
    next();
    return;
  }

  authenticated(req, res, next);
}
