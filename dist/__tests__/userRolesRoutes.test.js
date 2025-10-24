"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const app_1 = require("../server/app");
const prisma_1 = require("../server/lib/prisma");
const env_1 = require("../server/env");
const adminEmail = 'userroles-admin@nowis.local';
const targetEmail = 'userroles-target@nowis.local';
describe('UserRoles routes', () => {
    let adminToken;
    let regularToken;
    let adminRoleId;
    let targetUserId;
    beforeAll(async () => {
        await prisma_1.prisma.userRole.deleteMany({ where: { user: { email: { in: [adminEmail, targetEmail] } } } });
        await prisma_1.prisma.user.deleteMany({ where: { email: { in: [adminEmail, targetEmail] } } });
        const adminRole = await prisma_1.prisma.role.upsert({
            where: { name: 'ADMIN' },
            update: {},
            create: { name: 'ADMIN' }
        });
        const collabRole = await prisma_1.prisma.role.upsert({
            where: { name: 'COLLAB' },
            update: {},
            create: { name: 'COLLAB' }
        });
        adminRoleId = adminRole.id;
        const adminUser = await prisma_1.prisma.user.create({
            data: {
                email: adminEmail,
                passwordHash: 'irrelevant'
            }
        });
        await prisma_1.prisma.userRole.create({
            data: {
                userId: adminUser.id,
                roleId: adminRole.id
            }
        });
        const targetUser = await prisma_1.prisma.user.create({
            data: {
                email: targetEmail,
                passwordHash: 'irrelevant'
            }
        });
        targetUserId = targetUser.id;
        await prisma_1.prisma.userRole.create({
            data: {
                userId: targetUser.id,
                roleId: collabRole.id
            }
        });
        adminToken = jsonwebtoken_1.default.sign({ userId: adminUser.id }, env_1.env.JWT_SECRET, { expiresIn: '1h' });
        regularToken = jsonwebtoken_1.default.sign({ userId: targetUser.id }, env_1.env.JWT_SECRET, { expiresIn: '1h' });
    });
    afterAll(async () => {
        await prisma_1.prisma.userRole.deleteMany({ where: { user: { email: { in: [adminEmail, targetEmail] } } } });
        await prisma_1.prisma.user.deleteMany({ where: { email: { in: [adminEmail, targetEmail] } } });
    });
    it('refuse la création sans authentification', async () => {
        await (0, supertest_1.default)(app_1.app)
            .post('/api/userRoles')
            .send({ userId: targetUserId, roleId: adminRoleId })
            .expect(401);
    });
    it('bloque un utilisateur non administrateur', async () => {
        await (0, supertest_1.default)(app_1.app)
            .post('/api/userRoles')
            .set('Authorization', `Bearer ${regularToken}`)
            .send({ userId: targetUserId, roleId: adminRoleId })
            .expect(403);
    });
    it("permet à un administrateur d'ajouter puis retirer un rôle", async () => {
        const createResponse = await (0, supertest_1.default)(app_1.app)
            .post('/api/userRoles')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ userId: targetUserId, roleId: adminRoleId })
            .expect(201);
        expect(createResponse.body).toMatchObject({ userId: targetUserId, roleId: adminRoleId });
        const createdAssignment = await prisma_1.prisma.userRole.findUnique({
            where: { id: createResponse.body.id }
        });
        expect(createdAssignment).not.toBeNull();
        await (0, supertest_1.default)(app_1.app)
            .delete(`/api/userRoles/${createResponse.body.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(204);
        const deletedAssignment = await prisma_1.prisma.userRole.findUnique({
            where: { id: createResponse.body.id }
        });
        expect(deletedAssignment).toBeNull();
    });
});
