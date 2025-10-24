import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

const DEFAULT_UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');

function getUploadRoot(): string {
  return process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : DEFAULT_UPLOAD_DIR;
}

async function ensureDirectoryExists(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function saveAttachmentFile(options: {
  buffer: Buffer;
  propertyId: number;
  originalName: string;
}): Promise<{ storagePath: string; checksum: string; filename: string }>
{
  const { buffer, propertyId, originalName } = options;
  const root = getUploadRoot();
  const propertyFolder = path.join(root, `property-${propertyId}`);
  await ensureDirectoryExists(propertyFolder);

  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
  const extension = path.extname(originalName) || '.bin';
  const safeName = crypto.randomBytes(16).toString('hex');
  const filename = `${safeName}${extension}`;
  const absolutePath = path.join(propertyFolder, filename);
  const relativePath = path.relative(root, absolutePath);

  await fs.writeFile(absolutePath, buffer);

  return { storagePath: relativePath, checksum, filename };
}

export async function deleteAttachmentFile(storagePath: string) {
  try {
    await fs.unlink(resolveAttachmentPath(storagePath));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }

    throw error;
  }
}

export function resolveAttachmentPath(storagePath: string): string {
  if (path.isAbsolute(storagePath)) {
    return storagePath;
  }

  const root = getUploadRoot();
  return path.join(root, storagePath);
}
