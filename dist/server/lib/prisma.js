"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const client_1 = require("@prisma/client");
function buildDatasourceUrl() {
    const baseUrl = process.env.DATABASE_URL;
    if (!baseUrl) {
        return undefined;
    }
    if (process.env.NODE_ENV !== 'test' && !process.env.JEST_WORKER_ID) {
        return baseUrl;
    }
    try {
        const url = new URL(baseUrl);
        url.searchParams.set('connection_limit', '1');
        url.searchParams.set('pool_timeout', '0');
        return url.toString();
    }
    catch (_error) {
        return baseUrl;
    }
}
const datasourceUrl = buildDatasourceUrl();
const prisma = new client_1.PrismaClient(datasourceUrl
    ? {
        datasources: {
            db: {
                url: datasourceUrl
            }
        }
    }
    : undefined);
exports.prisma = prisma;
