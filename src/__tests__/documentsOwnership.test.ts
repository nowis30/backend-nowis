/// <reference types="jest" />
import jwt from 'jsonwebtoken';
import request from 'supertest';

import { app } from '../server/app';
import { env } from '../server/env';
import { prisma } from '../server/lib/prisma';

describe('Document metadata ownership', () => {
  const emails = ['document-owner@nowis.local', 'document-other@nowis.local'];
  let ownerToken: string;
  let otherToken: string;
  let documentId: number;

  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    const owner = await prisma.user.create({ data: { email: emails[0], passwordHash: 'test-only-unused' } });
    const other = await prisma.user.create({ data: { email: emails[1], passwordHash: 'test-only-unused' } });
    ownerToken = jwt.sign({ userId: owner.id }, env.JWT_SECRET, { expiresIn: '1h' });
    otherToken = jwt.sign({ userId: other.id }, env.JWT_SECRET, { expiresIn: '1h' });
    const document = await prisma.uploadedDocument.create({
      data: {
        userId: owner.id,
        domain: 'personal-income',
        label: 'Private owner document',
        notes: 'Private owner notes',
        originalName: 'fictional.txt',
        contentType: 'text/plain',
        size: 0,
        storagePath: 'tests/no-file-created.txt'
      }
    });
    documentId = document.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
  });

  it('allows the owner to update document metadata', async () => {
    const response = await request(app)
      .put(`/api/documents/${documentId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ label: 'Updated by owner', notes: 'Updated owner notes' })
      .expect(200);

    expect(response.body).toMatchObject({ id: documentId, label: 'Updated by owner', notes: 'Updated owner notes' });
    expect(await prisma.uploadedDocument.findUnique({ where: { id: documentId } }))
      .toMatchObject({ label: 'Updated by owner', notes: 'Updated owner notes' });
  });

  it('returns 404 for another account and leaves the document unchanged', async () => {
    const before = await prisma.uploadedDocument.findUniqueOrThrow({ where: { id: documentId } });
    const response = await request(app)
      .put(`/api/documents/${documentId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ label: 'Unauthorized change', notes: 'Unauthorized notes' })
      .expect(404);

    expect(response.body).toEqual({ error: 'Document introuvable.' });
    expect(await prisma.uploadedDocument.findUniqueOrThrow({ where: { id: documentId } })).toEqual(before);
  });

  it('returns the same 404 for a missing document', async () => {
    const response = await request(app)
      .put('/api/documents/2147483647')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ label: 'Missing document' })
      .expect(404);

    expect(response.body).toEqual({ error: 'Document introuvable.' });
  });
});
