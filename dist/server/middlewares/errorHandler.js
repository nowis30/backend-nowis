"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
const zod_1 = require("zod");
function errorHandler(err, _req, res, _next) {
    if (err instanceof zod_1.ZodError) {
        return res.status(400).json({
            error: 'Requête invalide.',
            details: err.issues.map((issue) => ({ path: issue.path, message: issue.message }))
        });
    }
    const message = err instanceof Error ? err.message : 'Erreur interne';
    const status = err instanceof Error && 'status' in err ? Number(err.status) : 500;
    res.status(Number.isNaN(status) ? 500 : status).json({ error: message });
}
