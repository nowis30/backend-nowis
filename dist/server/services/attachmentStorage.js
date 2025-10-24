"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveAttachmentFile = saveAttachmentFile;
exports.deleteAttachmentFile = deleteAttachmentFile;
exports.resolveAttachmentPath = resolveAttachmentPath;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const DEFAULT_UPLOAD_DIR = path_1.default.resolve(process.cwd(), 'uploads');
function getUploadRoot() {
    return process.env.UPLOADS_DIR ? path_1.default.resolve(process.env.UPLOADS_DIR) : DEFAULT_UPLOAD_DIR;
}
async function ensureDirectoryExists(dirPath) {
    await fs_1.promises.mkdir(dirPath, { recursive: true });
}
async function saveAttachmentFile(options) {
    const { buffer, propertyId, originalName } = options;
    const root = getUploadRoot();
    const propertyFolder = path_1.default.join(root, `property-${propertyId}`);
    await ensureDirectoryExists(propertyFolder);
    const checksum = crypto_1.default.createHash('sha256').update(buffer).digest('hex');
    const extension = path_1.default.extname(originalName) || '.bin';
    const safeName = crypto_1.default.randomBytes(16).toString('hex');
    const filename = `${safeName}${extension}`;
    const absolutePath = path_1.default.join(propertyFolder, filename);
    const relativePath = path_1.default.relative(root, absolutePath);
    await fs_1.promises.writeFile(absolutePath, buffer);
    return { storagePath: relativePath, checksum, filename };
}
async function deleteAttachmentFile(storagePath) {
    try {
        await fs_1.promises.unlink(resolveAttachmentPath(storagePath));
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            return;
        }
        throw error;
    }
}
function resolveAttachmentPath(storagePath) {
    if (path_1.default.isAbsolute(storagePath)) {
        return storagePath;
    }
    const root = getUploadRoot();
    return path_1.default.join(root, storagePath);
}
