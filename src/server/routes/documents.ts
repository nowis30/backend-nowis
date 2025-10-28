import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { promises as fs } from 'fs';

import { authenticated, type AuthenticatedRequest } from '../middlewares/authenticated';
import { prisma } from '../lib/prisma';
import { deleteUserDocumentFile, resolveUserDocumentPath, saveUserDocumentFile } from '../services/documentStorage';

const documentsRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

documentsRouter.use(authenticated);

const listQuery = z.object({
  domain: z.string().optional(),
  taxYear: z.coerce.number().int().optional()
});

function serialize(d: any) {
  return {
    id: d.id,
    domain: d.domain,
    label: d.label,
    notes: d.notes ?? null,
    originalName: d.originalName,
    contentType: d.contentType,
    size: d.size,
    storagePath: d.storagePath,
    checksum: d.checksum ?? null,
    taxYear: d.taxYear ?? null,
    shareholderId: d.shareholderId ?? null,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString()
  };
}

documentsRouter.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { domain, taxYear } = listQuery.parse(req.query);
  const docs = await (prisma as any).uploadedDocument.findMany({
      where: { userId: req.userId!, ...(domain ? { domain } : {}), ...(taxYear ? { taxYear } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
    });
    res.json(docs.map(serialize));
  } catch (error) {
    next(error);
  }
});

const uploadQuery = z.object({
  domain: z.string(),
  label: z.string().trim().min(1).optional(),
  taxYear: z.coerce.number().int().optional(),
  shareholderId: z.coerce.number().int().optional()
});

documentsRouter.post('/', upload.single('file'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Fichier requis (champ file).' });
    const { domain, taxYear, shareholderId, label } = uploadQuery.parse(req.query);

    const saved = await saveUserDocumentFile({ buffer: req.file.buffer, userId: req.userId!, originalName: req.file.originalname });

  const created = await (prisma as any).uploadedDocument.create({
      data: {
        userId: req.userId!,
        domain,
        label: label ?? req.file.originalname,
        originalName: req.file.originalname,
        contentType: req.file.mimetype,
        size: req.file.size,
        storagePath: saved.storagePath,
        content: req.file.buffer,
        checksum: saved.checksum,
        taxYear: taxYear ?? null,
        shareholderId: shareholderId ?? null
      }
    });

    res.status(201).json(serialize(created));
  } catch (error) {
    next(error);
  }
});

const idParam = z.object({ id: z.coerce.number().int().positive() });
const updateBody = z.object({ label: z.string().trim().min(1).optional(), notes: z.string().trim().optional() });

documentsRouter.get('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = idParam.parse(req.params);
  const doc = await (prisma as any).uploadedDocument.findFirst({ where: { id, userId: req.userId! } });
    if (!doc) return res.status(404).json({ error: 'Document introuvable.' });
    res.json(serialize(doc));
  } catch (error) {
    next(error);
  }
});

documentsRouter.get('/:id/download', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = idParam.parse(req.params);
  const doc = await (prisma as any).uploadedDocument.findFirst({ where: { id, userId: req.userId! } });
    if (!doc) return res.status(404).json({ error: 'Document introuvable.' });

    const abs = resolveUserDocumentPath(doc.storagePath);
    try {
      const stat = await fs.stat(abs);
      res.setHeader('Content-Type', doc.contentType || 'application/octet-stream');
      res.setHeader('Content-Length', String(stat.size));
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.originalName)}"`);
      const stream = (await import('fs')).createReadStream(abs);
      stream.pipe(res);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' && (doc as any).content) {
        const buf = (doc as any).content as Buffer;
        res.setHeader('Content-Type', doc.contentType || 'application/octet-stream');
        res.setHeader('Content-Length', String(buf.byteLength));
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.originalName)}"`);
        res.end(buf);
      } else {
        throw err;
      }
    }
  } catch (error) {
    next(error);
  }
});

documentsRouter.put('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = idParam.parse(req.params);
    const body = updateBody.parse(req.body);

  const updated = await (prisma as any).uploadedDocument.update({
      where: { id },
      data: { ...(body.label ? { label: body.label } : {}), ...(body.notes ? { notes: body.notes } : {}) }
    });

    res.json(serialize(updated));
  } catch (error) {
    next(error);
  }
});

documentsRouter.delete('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = idParam.parse(req.params);
  const doc = await (prisma as any).uploadedDocument.findFirst({ where: { id, userId: req.userId! } });
    if (!doc) return res.status(404).json({ error: 'Document introuvable.' });

  await (prisma as any).uploadedDocument.delete({ where: { id: doc.id } });
    await deleteUserDocumentFile(doc.storagePath);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export { documentsRouter };
