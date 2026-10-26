/// <reference types="jest" />
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('../server/lib/prisma', () => ({ prisma: {
  user: { findUnique: jest.fn() },
  userRole: { findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
  $transaction: jest.fn()
} }));
jest.mock('../server/env', () => ({ env: {
  JWT_SECRET: 'isolated-unit-test-key-not-for-production',
  ALLOW_PUBLIC_REGISTRATION: false
} }));
jest.mock('bcrypt', () => ({ __esModule: true, default: { hash: jest.fn().mockResolvedValue('test-hash') } }));

import { prisma } from '../server/lib/prisma';
import { env } from '../server/env';
import { authRouter } from '../server/routes/auth';
import { userRolesRouter } from '../server/routes/userRoles';
import { advisorHealthStatus } from '../server/services/advisors/healthStatus';

const app = express();
app.use(express.json());
app.use('/auth', authRouter);
app.use('/roles', userRolesRouter);
const token = jwt.sign({ userId: 1 }, env.JWT_SECRET);
const findMany = prisma.userRole.findMany as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  env.ALLOW_PUBLIC_REGISTRATION = false;
});

test('public signup is closed before database access by default', async () => {
  const response = await request(app).post('/auth/register').send({ email: 'a@example.test', password: 'Strong#2026!User' });
  expect(response.status).toBe(403);
  expect(response.body.code).toBe('REGISTRATION_DISABLED');
  expect(prisma.$transaction).not.toHaveBeenCalled();
  expect(prisma.user.findUnique).not.toHaveBeenCalled();
});

test('explicitly enabled signup creates a personal profile without assigning any role', async () => {
  env.ALLOW_PUBLIC_REGISTRATION = true;
  (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
  const tx = {
    user: { create: jest.fn().mockResolvedValue({ id: 7 }) },
    shareholder: { create: jest.fn().mockResolvedValue({ id: 9 }) },
    role: { upsert: jest.fn() }, userRole: { create: jest.fn() }
  };
  (prisma.$transaction as jest.Mock).mockImplementation(callback => callback(tx));
  const response = await request(app).post('/auth/register').send({ email: 'a@example.test', password: 'Strong#2026!User' });
  expect(response.status).toBe(201);
  expect(jwt.verify(response.body.token, env.JWT_SECRET)).toMatchObject({ userId: 7 });
  expect(tx.shareholder.create).toHaveBeenCalledTimes(1);
  expect(tx.role.upsert).not.toHaveBeenCalled();
  expect(tx.userRole.create).not.toHaveBeenCalled();
});

test('a company administrator cannot list global role assignments', async () => {
  const scopedGrant = { userId: 1, companyId: 41, role: { name: 'ADMIN' } };
  findMany.mockImplementation(({ where }) => Promise.resolve(
    where && where.companyId === scopedGrant.companyId ? [scopedGrant] : []
  ));
  const response = await request(app).get('/roles').set('Authorization', `Bearer ${token}`);
  expect(response.status).toBe(403);
  expect(findMany).toHaveBeenCalledTimes(1);
  expect(findMany.mock.calls[0][0].where).toMatchObject({ userId: 1, companyId: null });
});

test.each(['get', 'post', 'put'] as const)('%s role responses only select public user fields', async method => {
  const sensitiveUser = { id: 1, email: 'a@example.test', passwordHash: 'must-not-leave-server', createdAt: 'today', updatedAt: 'today' };
  const project = ({ include }: { include: { user: { select: Record<string, boolean> } } }) => {
    expect(include.user.select).toEqual({ id: true, email: true, createdAt: true, updatedAt: true });
    return { id: 8, user: Object.fromEntries(Object.entries(sensitiveUser).filter(([key]) => include.user.select[key])) };
  };
  findMany.mockImplementation(args => Promise.resolve(args.where ? [{ companyId: null }] : [project(args)]));
  (prisma.userRole.create as jest.Mock).mockImplementation(args => Promise.resolve(project(args)));
  (prisma.userRole.update as jest.Mock).mockImplementation(args => Promise.resolve(project(args)));
  let call = request(app)[method](method === 'put' ? '/roles/8' : '/roles').set('Authorization', `Bearer ${token}`);
  if (method !== 'get') call = call.send({ userId: 1, roleId: 1 });
  const response = await call;
  expect(response.status).toBe(method === 'post' ? 201 : 200);
  expect(JSON.stringify(response.body)).not.toContain('passwordHash');
  expect(JSON.stringify(response.body)).not.toContain('must-not-leave-server');
});

test('public advisor health is configuration-only and never exposes provider credentials', () => {
  const fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('No network allowed'));
  try {
    const status = advisorHealthStatus({ ADVISOR_ENGINE: 'gpt', OPENAI_API_KEY: 'private-test-value', OPENAI_PROVIDER: 'azure' });
    expect(status).toEqual({ engine: 'gpt', check: 'configuration-only', openai: { configured: true, provider: 'azure' } });
    expect(JSON.stringify(status)).not.toContain('private-test-value');
    expect(fetchSpy).not.toHaveBeenCalled();
  } finally { fetchSpy.mockRestore(); }
});
