import request from 'supertest';
import jwt from 'jsonwebtoken';

import { app } from '../server/app';
import { prisma } from '../server/lib/prisma';
import { env } from '../server/env';

const adminEmail = 'users-admin@nowis.local';
const newUserEmail = 'users-new@nowis.local';

describe('Users routes', () => {
  let adminToken: string;

  beforeAll(async () => {
    await prisma.userRole.deleteMany({ where: { user: { email: { in: [adminEmail, newUserEmail] } } } });
    await prisma.user.deleteMany({ where: { email: { in: [adminEmail, newUserEmail] } } });

    const adminRole = await prisma.role.upsert({
      where: { name: 'ADMIN' },
      update: {},
      create: { name: 'ADMIN' }
    });

    const adminUser = await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: 'irrelevant'
      }
    });

    await prisma.userRole.create({
      data: {
        userId: adminUser.id,
        roleId: adminRole.id
      }
    });

    adminToken = jwt.sign({ userId: adminUser.id }, env.JWT_SECRET, { expiresIn: '1h' });
  });

  afterAll(async () => {
    await prisma.userRole.deleteMany({ where: { user: { email: { in: [adminEmail, newUserEmail] } } } });
    await prisma.user.deleteMany({ where: { email: { in: [adminEmail, newUserEmail] } } });
  });

  it('refuse l’accès sans jeton', async () => {
    const response = await request(app).get('/api/users').expect(401);
    expect(response.body).toMatchObject({ error: 'Token requis.' });
  });

  it('retourne la liste des utilisateurs pour un administrateur', async () => {
    const response = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ email: adminEmail })
      ])
    );
  });

  it("permet la création d'un utilisateur avec un mot de passe fort", async () => {
    const payload = {
      email: newUserEmail,
      password: 'Strong#2025!User',
      roles: []
    };

    const response = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(201);

    expect(response.body).toMatchObject({ email: newUserEmail });

    const created = await prisma.user.findUnique({ where: { email: newUserEmail } });
    expect(created).not.toBeNull();
    expect(created?.passwordHash).not.toBe('Strong#2025!User');
  });
});
