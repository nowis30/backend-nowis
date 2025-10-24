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
describe('Expenses routes', () => {
    const email = 'expenses-case@nowis.local';
    let token;
    let userId;
    let propertyId;
    let expenseId;
    beforeAll(async () => {
        await prisma_1.prisma.user.deleteMany({ where: { email } });
        const user = await prisma_1.prisma.user.create({
            data: {
                email,
                passwordHash: 'irrelevant',
                properties: {
                    create: {
                        name: 'Bloc Taxes',
                        currentValue: 400000,
                        revenues: {
                            create: {
                                label: 'Loyer mensuel',
                                amount: 2500,
                                frequency: 'MENSUEL',
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
        await prisma_1.prisma.expense.deleteMany({ where: { property: { userId } } });
        await prisma_1.prisma.revenue.deleteMany({ where: { property: { userId } } });
        await prisma_1.prisma.property.deleteMany({ where: { userId } });
        await prisma_1.prisma.user.deleteMany({ where: { id: userId } });
    });
    it('creates, updates and removes recurring expenses while updating the summary', async () => {
        const listResponse = await (0, supertest_1.default)(app_1.app)
            .get('/api/expenses')
            .set('Authorization', `Bearer ${token}`)
            .expect(200);
        expect(listResponse.body).toEqual([]);
        const createResponse = await (0, supertest_1.default)(app_1.app)
            .post('/api/expenses')
            .set('Authorization', `Bearer ${token}`)
            .send({
            propertyId,
            label: 'Assurances habitation',
            category: 'Assurance',
            amount: 1200,
            frequency: 'ANNUEL',
            startDate: '2024-01-01'
        })
            .expect(201);
        expenseId = createResponse.body.id;
        expect(createResponse.body).toMatchObject({
            propertyId,
            label: 'Assurances habitation',
            category: 'Assurance',
            amount: 1200,
            frequency: 'ANNUEL'
        });
        const summaryAfterCreate = await (0, supertest_1.default)(app_1.app)
            .get('/api/summary')
            .set('Authorization', `Bearer ${token}`)
            .expect(200);
        const propertySummary = summaryAfterCreate.body.properties.find((item) => item.propertyId === propertyId);
        expect(propertySummary).toBeDefined();
        expect(propertySummary.operatingExpenses).toBeCloseTo(1200, 2);
        const updateResponse = await (0, supertest_1.default)(app_1.app)
            .put(`/api/expenses/${expenseId}`)
            .set('Authorization', `Bearer ${token}`)
            .send({
            propertyId,
            label: 'Assurances habitation',
            category: 'Assurance',
            amount: 1500,
            frequency: 'ANNUEL',
            startDate: '2024-01-01',
            endDate: '2024-12-31'
        })
            .expect(200);
        expect(updateResponse.body).toMatchObject({ amount: 1500, endDate: '2024-12-31T00:00:00.000Z' });
        const summaryAfterUpdate = await (0, supertest_1.default)(app_1.app)
            .get('/api/summary')
            .set('Authorization', `Bearer ${token}`)
            .expect(200);
        const updatedPropertySummary = summaryAfterUpdate.body.properties.find((item) => item.propertyId === propertyId);
        expect(updatedPropertySummary).toBeDefined();
        expect(updatedPropertySummary.operatingExpenses).toBeCloseTo(1500, 2);
        await (0, supertest_1.default)(app_1.app)
            .delete(`/api/expenses/${expenseId}`)
            .set('Authorization', `Bearer ${token}`)
            .expect(204);
        const summaryAfterDelete = await (0, supertest_1.default)(app_1.app)
            .get('/api/summary')
            .set('Authorization', `Bearer ${token}`)
            .expect(200);
        const finalPropertySummary = summaryAfterDelete.body.properties.find((item) => item.propertyId === propertyId);
        expect(finalPropertySummary).toBeDefined();
        expect(finalPropertySummary.operatingExpenses).toBeCloseTo(0, 2);
    });
    it('rejects invalid payloads (amount <= 0, labels vides)', async () => {
        const response = await (0, supertest_1.default)(app_1.app)
            .post('/api/expenses')
            .set('Authorization', `Bearer ${token}`)
            .send({
            propertyId,
            label: '   ',
            category: '   ',
            amount: 0,
            frequency: 'ANNUEL',
            startDate: '2024-01-01'
        })
            .expect(400);
        expect(response.body).toHaveProperty('error');
    });
    it("exporte le rapport fiscal des dépenses en JSON et CSV", async () => {
        const otherProperty = await prisma_1.prisma.property.create({
            data: {
                userId,
                name: 'Bloc Fiscal'
            }
        });
        const createdExpenseIds = [];
        const monthly = await prisma_1.prisma.expense.create({
            data: {
                propertyId,
                label: 'Taxes mensuelles',
                category: 'Taxes',
                amount: 100,
                frequency: 'MENSUEL',
                startDate: new Date('2024-01-01')
            }
        });
        createdExpenseIds.push(monthly.id);
        const punctual = await prisma_1.prisma.expense.create({
            data: {
                propertyId,
                label: 'Réparation urgente',
                category: 'Entretien',
                amount: 800,
                frequency: 'PONCTUEL',
                startDate: new Date('2024-03-15')
            }
        });
        createdExpenseIds.push(punctual.id);
        const weekly = await prisma_1.prisma.expense.create({
            data: {
                propertyId,
                label: 'Entretien paysager',
                category: 'Entretien',
                amount: 50,
                frequency: 'HEBDOMADAIRE',
                startDate: new Date('2024-01-01'),
                endDate: new Date('2024-01-28')
            }
        });
        createdExpenseIds.push(weekly.id);
        const annual = await prisma_1.prisma.expense.create({
            data: {
                propertyId: otherProperty.id,
                label: 'Assurance multirisque',
                category: 'Assurance',
                amount: 600,
                frequency: 'ANNUEL',
                startDate: new Date('2023-07-01'),
                endDate: new Date('2025-07-01')
            }
        });
        createdExpenseIds.push(annual.id);
        const jsonResponse = await (0, supertest_1.default)(app_1.app)
            .get('/api/expenses/export/fiscal?year=2024')
            .set('Authorization', `Bearer ${token}`)
            .expect(200);
        expect(jsonResponse.body).toHaveProperty('year', 2024);
        expect(jsonResponse.body).toHaveProperty('generatedAt');
        const propertyReport = jsonResponse.body.properties.find((entry) => entry.propertyId === propertyId);
        expect(propertyReport).toBeDefined();
        expect(propertyReport.totalAmount).toBeCloseTo(1200 + 800 + 200, 2);
        const taxesCategory = propertyReport.categories.find((category) => category.category === 'Taxes');
        expect(taxesCategory).toBeDefined();
        expect(taxesCategory.totalAmount).toBeCloseTo(1200, 2);
        expect(taxesCategory.items[0]).toMatchObject({ occurrences: 12, totalAmount: 1200 });
        const entretienCategory = propertyReport.categories.find((category) => category.category === 'Entretien');
        expect(entretienCategory).toBeDefined();
        expect(entretienCategory.totalAmount).toBeCloseTo(800 + 200, 2);
        const otherPropertyReport = jsonResponse.body.properties.find((entry) => entry.propertyId === otherProperty.id);
        expect(otherPropertyReport).toBeDefined();
        expect(otherPropertyReport.totalAmount).toBeCloseTo(600, 2);
        expect(jsonResponse.body.totalAmount).toBeCloseTo(1200 + 800 + 200 + 600, 2);
        const csvResponse = await (0, supertest_1.default)(app_1.app)
            .get('/api/expenses/export/fiscal?year=2024&format=csv')
            .set('Authorization', `Bearer ${token}`)
            .expect('Content-Type', /text\/csv/)
            .expect(200);
        expect(csvResponse.text).toContain('Bloc Taxes');
        expect(csvResponse.text).toContain('Assurance multirisque');
        expect(csvResponse.text).toContain('TOTAL IMMEUBLE');
        await prisma_1.prisma.expense.deleteMany({ where: { id: { in: createdExpenseIds } } });
        await prisma_1.prisma.property.delete({ where: { id: otherProperty.id } });
    });
});
