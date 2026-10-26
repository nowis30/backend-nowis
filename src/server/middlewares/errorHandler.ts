import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  // Gestions spécifiques pour les erreurs de téléversement (multer)
  if (typeof err === 'object' && err !== null && 'name' in err && err.name === 'MulterError') {
    const code = 'code' in err ? err.code : undefined;
    if (code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Fichier trop volumineux (max 20 Mo).' });
    }
    const message = 'message' in err ? err.message : undefined;
    return res.status(400).json({ error: message || 'Erreur de téléversement.' });
  }

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
