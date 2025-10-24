"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticated = authenticated;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const zod_1 = require("zod");
const env_1 = require("../env");
const payloadSchema = zod_1.z.object({
    userId: zod_1.z.number()
});
function authenticated(req, res, next) {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).json({ error: 'Token requis.' });
    }
    const token = authorization.replace('Bearer ', '');
    try {
        const payload = payloadSchema.parse(jsonwebtoken_1.default.verify(token, env_1.env.JWT_SECRET));
        req.userId = payload.userId;
        next();
    }
    catch (error) {
        res.status(401).json({ error: 'Token invalide.' });
    }
}
