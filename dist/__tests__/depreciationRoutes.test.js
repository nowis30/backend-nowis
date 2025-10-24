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
describe('Depreciation routes', () => {
    const email = 'depreciation-case@nowis.local';
    let token;
    let userId;
    let propertyId;
    beforeAll(async () => {
        await prisma_1.prisma.user.deleteMany({ where: { email } });
        const user = await prisma_1.prisma.user.create({
            data: {
                email,
                passwordHash: 'irrelevant',
                properties: {
                    create: {
                        name: 'Immeuble CCA',
                        currentValue: 500000,
                        revenues: {
                            create: {
                                label: 'Loyers',
                                amount: 5000,
                                frequency: 'MENSUEL',
                                startDate: new Date('2024-01-01')
                            }
                        },
                        expenses: {
                            create: {
                                label: 'Assurances',
                                category: 'Assurance',
                                amount: 1000,
                                frequency: 'MENSUEL',
                                startDate: new Date('2024-01-01')
                            }
                        }
                    }
                }
            },
            include: {
                properties: true
            }
        });
        userId = user.id;
        propertyId = user.properties[0].id;
        token = jsonwebtoken_1.default.sign({ userId }, env_1.env.JWT_SECRET, { expiresIn: '1h' });
    });
    afterAll(async () => {
        await prisma_1.prisma.depreciationSetting.deleteMany({ where: { propertyId } });
        await prisma_1.prisma.expense.deleteMany({ where: { property: { userId } } });
        await prisma_1.prisma.revenue.deleteMany({ where: { property: { userId } } });
        await prisma_1.prisma.property.deleteMany({ where: { userId } });
        await prisma_1.prisma.user.deleteMany({ where: { id: userId } });
    });
    it('returns default depreciation values when nothing is configured', async () => {
        const response = await (0, supertest_1.default)(app_1.app)
            .get(`/api/properties/${propertyId}/depreciation`)
            .set('Authorization', `Bearer ${token}`)
            .expect(200);
        expect(response.body).toEqual({
            classCode: '',
            ccaRate: 0,
            openingUcc: 0,
            additions: 0,
            dispositions: 0
        });
    });
    it('saves depreciation settings and integrates them into the summary', async () => {
        const payload = {
            classCode: '1',
            ccaRate: 0.04,
            openingUcc: 100000,
            additions: 10000,
            dispositions: 0
        };
        const saveResponse = await (0, supertest_1.default)(app_1.app)
            .put(`/api/properties/${propertyId}/depreciation`)
            .set('Authorization', `Bearer ${token}`)
            .send(payload)
            .expect(200);
        expect(saveResponse.body).toEqual(payload);
        const fetchResponse = await (0, supertest_1.default)(app_1.app)
            .get(`/api/properties/${propertyId}/depreciation`)
            .set('Authorization', `Bearer ${token}`)
            .expect(200);
        expect(fetchResponse.body).toEqual(payload);
        const summaryResponse = await (0, supertest_1.default)(app_1.app)
            .get('/api/summary')
            .set('Authorization', `Bearer ${token}`)
            .expect(200);
        const propertySummary = summaryResponse.body.properties.find((item) => item.propertyId === propertyId);
        expect(propertySummary).toBeDefined();
        expect(propertySummary.cca).toBeCloseTo(4000, 2);
        expect(summaryResponse.body.totals.cca).toBeCloseTo(4000, 2);
    });
});
