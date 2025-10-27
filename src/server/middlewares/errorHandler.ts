import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Requête invalide.',
      details: err.issues.map((issue) => ({ path: issue.path, message: issue.message }))
    });
  }

  const message = err instanceof Error ? err.message : 'Erreur interne';
  if (err instanceof Error) {
    // Log unexpected errors for easier diagnostics during tests.
    console.error(err);
  }
  const status = err instanceof Error && 'status' in err ? Number((err as Error & { status?: number }).status) : 500;
  res.status(Number.isNaN(status) ? 500 : status).json({ error: message });
}
