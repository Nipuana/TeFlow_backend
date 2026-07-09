import crypto from 'crypto';
import { config } from '../config';
import { ApiError } from '../utils/ApiError';

/**
 * File storage ADAPTER (in-memory blob store) behind the FileStorage port.
 *
 * Enforces attachment hardening (API4 + upload-safety):
 *   - size cap (MAX_UPLOAD_BYTES),
 *   - content-type allow-list validated by magic-byte SNIFFING (not the
 *     client-supplied MIME, which is trivially spoofed),
 *   - server-generated random object keys (never trust client file names —
 *     defeats path traversal and overwrite attacks).
 *
 * Swap this file for an S3/GCS adapter with the same interface for production.
 */
const ALLOWED: Record<string, Buffer[] | null> = {
  'image/png': [Buffer.from([0x89, 0x50, 0x4e, 0x47])],
  'image/jpeg': [Buffer.from([0xff, 0xd8, 0xff])],
  'image/gif': [Buffer.from('GIF87a'), Buffer.from('GIF89a')],
  'application/pdf': [Buffer.from('%PDF-')],
  'text/plain': null, // no reliable magic bytes; accepted as-is
  'text/csv': null,
};

interface Blob {
  key: string;
  contentType: string;
  size: number;
  data: Buffer;
  ownerId: string;
}
const blobs = new Map<string, Blob>();

function sniffContentType(buffer: Buffer): string | null {
  for (const [type, signatures] of Object.entries(ALLOWED)) {
    if (!signatures) continue;
    if (signatures.some((sig) => buffer.subarray(0, sig.length).equals(sig))) {
      return type;
    }
  }
  return null;
}

export function store({
  buffer,
  declaredType,
  ownerId,
}: {
  buffer: Buffer;
  declaredType: string;
  ownerId: string;
}): { key: string; contentType: string; size: number } {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw ApiError.badRequest('Empty file');
  }
  if (buffer.length > config.limits.maxUploadBytes) {
    throw ApiError.tooLarge(`File exceeds ${config.limits.maxUploadBytes} bytes`);
  }

  const sniffed = sniffContentType(buffer);
  const contentType = sniffed || (ALLOWED[declaredType] === null ? declaredType : null);
  if (!contentType || !(contentType in ALLOWED)) {
    throw ApiError.badRequest('Unsupported or mismatched file type');
  }

  const key = crypto.randomUUID(); // random, ignores client-supplied name
  blobs.set(key, { key, contentType, size: buffer.length, data: buffer, ownerId });
  return { key, contentType, size: buffer.length };
}

export function get(key: string): Blob | undefined {
  return blobs.get(key);
}

export const ALLOWED_TYPES = Object.keys(ALLOWED);
