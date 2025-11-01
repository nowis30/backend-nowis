/// <reference types="jest" />
import request from 'supertest';
import jwt from 'jsonwebtoken';

import { app } from '../server/app';
import { prisma } from '../server/lib/prisma';
import { env } from '../server/env';
import { purgeUsersByEmails, purgeUsersByIds } from './helpers/prismaCleanup';

const adminEmail = 'userroles-admin@nowis.local';
const targetEmail = 'userroles-target@nowis.local';

describe('UserRoles routes', () => {
  jest.setTimeout(15000);

  let adminToken: string;
  let regularToken: string;
  let adminRoleId: number;
  let targetUserId: number;
  let adminUserId: number;

  beforeAll(async () => {
    await purgeUsersByEmails([adminEmail, targetEmail]);

    const adminRole = await prisma.role.upsert({
      where: { name: 'ADMIN' },
      update: {},
      create: { name: 'ADMIN' }
    });

    const collabRole = await prisma.role.upsert({
      where: { name: 'COLLAB' },
      update: {},
      create: { name: 'COLLAB' }
    });

    adminRoleId = adminRole.id;

    const adminUser = await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: 'irrelevant'
      }
    });

    adminUserId = adminUser.id;

    await prisma.userRole.create({
      data: {
        userId: adminUser.id,
        roleId: adminRole.id
      }
    });

    const targetUser = await prisma.user.create({
      data: {
        email: targetEmail,
        passwordHash: 'irrelevant'
      }
    });

    targetUserId = targetUser.id;

    await prisma.userRole.create({
      data: {
        userId: targetUser.id,
        roleId: collabRole.id
      }
    });

    adminToken = jwt.sign({ userId: adminUser.id }, env.JWT_SECRET, { expiresIn: '1h' });
    regularToken = jwt.sign({ userId: targetUser.id }, env.JWT_SECRET, { expiresIn: '1h' });
  });

  afterAll(async () => {
    await purgeUsersByIds([adminUserId, targetUserId]);
  });

  it('refuse la création sans authentification', async () => {
    await request(app)
      .post('/api/userRoles')
      .send({ userId: targetUserId, roleId: adminRoleId })
      .expect(401);
  });

  it('bloque un utilisateur non administrateur', async () => {
    await request(app)
      .post('/api/userRoles')
      .set('Authorization', `Bearer ${regularToken}`)
      .send({ userId: targetUserId, roleId: adminRoleId })
      .expect(403);
  });

  it("permet à un administrateur d'ajouter puis retirer un rôle", async () => {
    const createResponse = await request(app)
      .post('/api/userRoles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: targetUserId, roleId: adminRoleId })
      .expect(201);

    expect(createResponse.body).toMatchObject({ userId: targetUserId, roleId: adminRoleId });

    const createdAssignment = await prisma.userRole.findUnique({
      where: { id: createResponse.body.id }
    });
    expect(createdAssignment).not.toBeNull();

    await request(app)
      .delete(`/api/userRoles/${createResponse.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204);

    const deletedAssignment = await prisma.userRole.findUnique({
      where: { id: createResponse.body.id }
    });
    expect(deletedAssignment).toBeNull();
  });
});
