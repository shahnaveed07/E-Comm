import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { AppError } from '../../middleware/errorHandler.js';

const MAGIC_SIGNATURES = [
  { mime: 'image/png', ext: 'png', check: (buf) => buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 },
  { mime: 'image/jpeg', ext: 'jpg', check: (buf) => buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff },
  {
    mime: 'image/webp',
    ext: 'webp',
    check: (buf) =>
      buf.length >= 12 &&
      buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buf.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  {
    mime: 'image/gif',
    ext: 'gif',
    check: (buf) => buf.length >= 6 && buf.subarray(0, 3).toString('ascii') === 'GIF',
  },
];

export function detectImageFormat(buffer) {
  for (const sig of MAGIC_SIGNATURES) {
    if (sig.check(buffer)) return sig;
  }
  return null;
}

export function createImageStorageService({ config }) {
  const localUploadDir = path.join(process.cwd(), '.data', 'uploads');

  async function uploadImageBase64({ base64Data, filename = 'harvest.jpg' }) {
    if (!base64Data || typeof base64Data !== 'string') {
      throw new AppError(400, 'Image data is required.', 'VALIDATION_ERROR');
    }

    const stripped = base64Data.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
    const buffer = Buffer.from(stripped, 'base64');
    if (buffer.length === 0) {
      throw new AppError(400, 'Uploaded image is empty.', 'VALIDATION_ERROR');
    }
    if (buffer.length > config.storage.maxImageBytes) {
      throw new AppError(
        413,
        `Image exceeds maximum allowed size (${Math.round(config.storage.maxImageBytes / 1024 / 1024)} MB).`,
        'FILE_TOO_LARGE'
      );
    }

    const detected = detectImageFormat(buffer);
    if (!detected) {
      throw new AppError(
        400,
        'Unsupported file type. Only PNG, JPEG, WebP, and GIF images are allowed.',
        'INVALID_MIME_TYPE'
      );
    }

    const safeBase = String(filename).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 40);
    const key = `products/${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${safeBase}.${detected.ext}`;

    if (
      config.storage.provider === 'cloudinary' &&
      config.storage.cloudinary.cloudName &&
      config.storage.cloudinary.apiKey &&
      config.storage.cloudinary.apiSecret
    ) {
      const timestamp = Math.floor(Date.now() / 1000);
      const folder = 'sylvan-grove/products';
      const toSign = `folder=${folder}&timestamp=${timestamp}${config.storage.cloudinary.apiSecret}`;
      const signature = crypto.createHash('sha1').update(toSign).digest('hex');

      const form = new FormData();
      form.append('file', `data:${detected.mime};base64,${buffer.toString('base64')}`);
      form.append('api_key', config.storage.cloudinary.apiKey);
      form.append('timestamp', String(timestamp));
      form.append('folder', folder);
      form.append('signature', signature);

      const endpoint = `https://api.cloudinary.com/v1_1/${config.storage.cloudinary.cloudName}/image/upload`;
      const res = await fetch(endpoint, { method: 'POST', body: form });
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new AppError(502, `Cloudinary upload failed: ${errBody}`, 'STORAGE_UPLOAD_FAILED');
      }
      const data = await res.json();
      return {
        url: data.secure_url,
        storageKey: data.public_id,
        provider: 'cloudinary',
        mimeType: detected.mime,
        bytes: buffer.length,
      };
    }

    // Validated local disk storage fallback (or S3 compatible pre-configured URL)
    fs.mkdirSync(localUploadDir, { recursive: true });
    const fileName = path.basename(key);
    fs.writeFileSync(path.join(localUploadDir, fileName), buffer);

    return {
      url: `/uploads/${fileName}`,
      storageKey: fileName,
      provider: 'local',
      mimeType: detected.mime,
      bytes: buffer.length,
    };
  }

  return {
    localUploadDir,
    uploadImageBase64,
  };
}
