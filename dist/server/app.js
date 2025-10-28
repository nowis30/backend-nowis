"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const pino_http_1 = __importDefault(require("pino-http"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const index_1 = require("./routes/index");
const logger_1 = require("./lib/logger");
const errorHandler_1 = require("./middlewares/errorHandler");
const telemetry_1 = require("./middlewares/telemetry");
const app = (0, express_1.default)();
exports.app = app;
// Derrière le proxy de Render/Cloudflare, il faut activer "trust proxy"
// pour que express-rate-limit et les IP clientes fonctionnent correctement.
// Voir: https://express-rate-limit.github.io/ERR_ERL_UNEXPECTED_X_FORWARDED_FOR/
app.set('trust proxy', 1);
const apiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: 'Trop de requêtes, réessayez plus tard.'
});
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({ origin: true, credentials: true }));
app.use(express_1.default.json());
app.use((0, pino_http_1.default)({ logger: logger_1.logger }));
app.use(telemetry_1.telemetry);
app.use('/api', apiLimiter, index_1.routes);
app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
});
// Alias pratique: certaines intégrations testent /api/health
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
});
app.use(errorHandler_1.errorHandler);
