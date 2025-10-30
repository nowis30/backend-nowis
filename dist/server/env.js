"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
require("dotenv/config");
const zod_1 = require("zod");
const envSchema = zod_1.z.object({
    PORT: zod_1.z.coerce.number().default(4000),
    DATABASE_URL: zod_1.z.string().min(1),
    JWT_SECRET: zod_1.z.string().min(16),
    ADVISOR_ENGINE: zod_1.z.enum(['heuristic', 'gpt']).default('heuristic'),
    OPENAI_API_KEY: zod_1.z.string().optional(),
    OPENAI_BASE_URL: zod_1.z.string().url().optional(),
    OPENAI_MODEL: zod_1.z.string().default('gpt-4.1'),
    OPENAI_MODEL_CORE: zod_1.z.string().optional(),
    OPENAI_MODEL_TARGETED: zod_1.z.string().optional(),
    OPENAI_MODEL_VISION: zod_1.z.string().optional(),
    OPENAI_PROVIDER: zod_1.z.enum(['openai', 'azure']).optional(),
    OPENAI_AZURE_DEPLOYMENT: zod_1.z.string().optional(),
    OPENAI_API_VERSION: zod_1.z.string().optional(),
    ADVISOR_PORTAL_API_KEY: zod_1.z.string().optional(),
    REDIS_URL: zod_1.z.string().url().optional(),
    POST_TO_LEDGER_DEFAULT: zod_1.z
        .preprocess((value) => {
        if (typeof value === 'boolean')
            return value;
        if (typeof value === 'string') {
            const n = value.trim().toLowerCase();
            return ['1', 'true', 'yes', 'on'].includes(n);
        }
        return undefined;
    }, zod_1.z.boolean())
        .default(false),
    ENABLE_WEALTH_SNAPSHOT_JOB: zod_1.z
        .preprocess((value) => {
        if (typeof value === 'boolean') {
            return value;
        }
        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            return ['1', 'true', 'yes', 'on'].includes(normalized);
        }
        return undefined;
    }, zod_1.z.boolean())
        .default(false),
    WEALTH_SNAPSHOT_INTERVAL_MINUTES: zod_1.z.coerce.number().int().min(5).default(720),
    ENABLE_MONITORING_JOBS: zod_1.z
        .preprocess((value) => {
        if (typeof value === 'boolean')
            return value;
        if (typeof value === 'string') {
            const n = value.trim().toLowerCase();
            return ['1', 'true', 'yes', 'on'].includes(n);
        }
        return undefined;
    }, zod_1.z.boolean())
        .default(false),
    MONITOR_HEALTH_INTERVAL_SECONDS: zod_1.z.coerce.number().int().min(15).default(60),
    MONITOR_USER_EMAIL: zod_1.z.string().email().optional()
});
exports.env = envSchema.parse(process.env);
