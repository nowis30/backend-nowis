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
describe('Revenues routes', () => {
    const email = 'revenues-case@nowis.local';
    let token;
    let userId;
    let propertyId;
    let revenueId;
    beforeAll(async () => {
        await prisma_1.prisma.user.deleteMany({ where: { email } });
        const user = await prisma_1.prisma.user.create({
            data: {
                email,
                passwordHash: 'irrelevant',
                properties: {
                    create: {
                        name: 'Bloc Revenus',
                        currentValue: 350000,
                        expenses: {
                            create: {
                                label: 'Assurances',
                                category: 'Assurance',
                                amount: 900,
                                frequency: 'ANNUEL',
                                startDate: new Date('2024-01-01')
                            }
                        }
                    }
                }
            },
            include: { properties: true }
        });
        userId = user.id;
        propertyId = user.properties[0].id;
        token = jsonwebtoken_1.default.sign({ userId }, env_1.env.JWT_SECRET, { expiresIn: '1h' });
    });
    afterAll(async () => {
        await prisma_1.prisma.revenue.deleteMany({ where: { property: { userId } } });
        await prisma_1.prisma.expense.deleteMany({ where: { property: { userId } } });
        await prisma_1.prisma.property.deleteMany({ where: { userId } });
        await prisma_1.prisma.user.deleteMany({ where: { id: userId } });
    });
    it('creates, updates and removes recurring revenues while updating the summary', async () => {
        const listResponse = await (0, supertest_1.default)(app_1.app)
            .get('/api/revenues')
            .set('Authorization', `Bearer ${token}`)
            .expect(200);
        expect(listResponse.body).toEqual([]);
        const createResponse = await (0, supertest_1.default)(app_1.app)
            .post('/api/revenues')
            .set('Authorization', `Bearer ${token}`)
            .send({
            propertyId,
            label: 'Loyers résidentiels',
            amount: 2400,
            frequency: 'MENSUEL',
            startDate: '2024-01-01'
        })
            .expect(201);
        revenueId = createResponse.body.id;
        expect(createResponse.body).toMatchObject({
            propertyId,
            label: 'Loyers résidentiels',
            amount: 2400,
            frequency: 'MENSUEL'
        });
        const summaryAfterCreate = await (0, supertest_1.default)(app_1.app)
            .get('/api/summary')
            .set('Authorization', `Bearer ${token}`)
            .expect(200);
        const propertySummary = summaryAfterCreate.body.properties.find((item) => item.propertyId === propertyId);
        expect(propertySummary).toBeDefined();
        expect(propertySummary.grossIncome).toBeCloseTo(2400, 2);
        const updateResponse = await (0, supertest_1.default)(app_1.app)
            .put(`/api/revenues/${revenueId}`)
            .set('Authorization', `Bearer ${token}`)
            .send({
            propertyId,
            label: 'Loyers résidentiels',
            amount: 2700,
            frequency: 'MENSUEL',
            startDate: '2024-01-01',
            endDate: '2024-12-31'
        })
            .expect(200);
        expect(updateResponse.body).toMatchObject({ amount: 2700, endDate: '2024-12-31T00:00:00.000Z' });
        const summaryAfterUpdate = await (0, supertest_1.default)(app_1.app)
            .get('/api/summary')
            .set('Authorization', `Bearer ${token}`)
            .expect(200);
        const updatedSummary = summaryAfterUpdate.body.properties.find((item) => item.propertyId === propertyId);
        expect(updatedSummary).toBeDefined();
        expect(updatedSummary.grossIncome).toBeCloseTo(2700, 2);
        await (0, supertest_1.default)(app_1.app)
            .delete(`/api/revenues/${revenueId}`)
            .set('Authorization', `Bearer ${token}`)
            .expect(204);
        const summaryAfterDelete = await (0, supertest_1.default)(app_1.app)
            .get('/api/summary')
            .set('Authorization', `Bearer ${token}`)
            .expect(200);
        const finalSummary = summaryAfterDelete.body.properties.find((item) => item.propertyId === propertyId);
        expect(finalSummary).toBeDefined();
        expect(finalSummary.grossIncome).toBeCloseTo(0, 2);
    });
    it('rejects invalid payloads (amount <= 0, label vide)', async () => {
        const response = await (0, supertest_1.default)(app_1.app)
            .post('/api/revenues')
            .set('Authorization', `Bearer ${token}`)
            .send({
            propertyId,
            label: '   ',
            amount: 0,
            frequency: 'MENSUEL',
            startDate: '2024-01-01'
        })
            .expect(400);
        expect(response.body).toHaveProperty('error');
    });
    it('filtre les revenus par immeuble', async () => {
        const otherProperty = await prisma_1.prisma.property.create({
            data: {
                userId,
                name: 'Bloc Commercial',
                currentValue: 600000
            }
        });
        await prisma_1.prisma.revenue.create({
            data: {
                propertyId: otherProperty.id,
                label: 'Local commercial',
                amount: 5000,
                frequency: 'MENSUEL',
                startDate: new Date('2024-01-01')
            }
        });
        const response = await (0, supertest_1.default)(app_1.app)
            .get(`/api/revenues?propertyId=${otherProperty.id}`)
            .set('Authorization', `Bearer ${token}`)
            .expect(200);
        expect(Array.isArray(response.body)).toBe(true);
        expect(response.body).toHaveLength(1);
        expect(response.body[0]).toMatchObject({ propertyId: otherProperty.id, label: 'Local commercial' });
    });
    it('importe un fichier CSV et ignore les lignes invalides', async () => {
        const csvProperty = await prisma_1.prisma.property.create({
            data: {
                userId,
                name: 'Bloc CSV',
                currentValue: 250000
            }
        });
        const csvPayload = [
            'propertyId,propertyName,label,amount,frequency,startDate,endDate',
            `${propertyId},,Loyer 1,1200,MENSUEL,2024-01-01,`,
            `,${csvProperty.name},Loyer 2,1500,MENSUEL,2024-02-01,2024-12-31`,
            `,,Ligne invalide,1500,MENSUEL,2024-02-01,`
        ].join('\n');
        const response = await (0, supertest_1.default)(app_1.app)
            .post('/api/revenues/import')
            .set('Authorization', `Bearer ${token}`)
            .set('Content-Type', 'text/csv')
            .send(csvPayload)
            .expect(201);
        expect(response.body.inserted).toBe(2);
        expect(response.body.items).toHaveLength(2);
        expect(response.body.errors).toEqual(expect.arrayContaining([
            expect.objectContaining({
                line: 4,
                message: expect.stringMatching(/Immeuble introuvable|Identifiant immeuble manquant/)
            })
        ]));
        const importedLabels = await prisma_1.prisma.revenue.findMany({
            where: { property: { userId }, label: { in: ['Loyer 1', 'Loyer 2'] } },
            select: { label: true }
        });
        expect(importedLabels).toHaveLength(2);
        await prisma_1.prisma.revenue.deleteMany({ where: { property: { userId }, label: { in: ['Loyer 1', 'Loyer 2'] } } });
        await prisma_1.prisma.property.delete({ where: { id: csvProperty.id } });
    });
});
