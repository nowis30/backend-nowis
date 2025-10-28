"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
const zod_1 = require("zod");
function errorHandler(err, _req, res, _next) {
    // Gestions spécifiques pour les erreurs de téléversement (multer)
    if (typeof err === 'object' && err !== null && err.name === 'MulterError') {
        const code = err.code;
        if (code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ error: 'Fichier trop volumineux (max 20 Mo).' });
        }
        return res.status(400).json({ error: err.message || 'Erreur de téléversement.' });
    }
    if (err instanceof zod_1.ZodError) {
        return res.status(400).json({
            error: 'Requête invalide.',
            details: err.issues.map((issue) => ({ path: issue.path, message: issue.message }))
        });
    }
    const message = err instanceof Error ? err.message : 'Erreur interne';
    if (err instanceof Error) {
        // Log unexpected errors for easier diagnostics during tests.
        console.error(err);
    }
    const status = err instanceof Error && 'status' in err ? Number(err.status) : 500;
    res.status(Number.isNaN(status) ? 500 : status).json({ error: message });
}
