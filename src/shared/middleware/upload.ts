import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { config } from '../config';
import { ApiError } from '../utils/ApiError';

/**
 * Multipart upload handling (multer) for profile pictures.
 *
 * Hardening (API4 + upload safety):
 *   - memory storage only — bytes never touch disk with a client-controlled name
 *     (defeats path traversal / overwrite), and we hand the buffer to the storage
 *     adapter which re-validates by MAGIC BYTES, not the client MIME.
 *   - a single file, capped at MAX_UPLOAD_BYTES.
 *   - a fast image-only MIME pre-filter (the byte-sniff in fileStorage is the
 *     real authority; this just rejects obvious non-images early).
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.limits.maxUploadBytes, files: 1 },
  fileFilter(_req, file, cb) {
    if (/^image\/(png|jpe?g|gif)$/i.test(file.mimetype)) return cb(null, true);
    cb(new ApiError(400, 'Only PNG, JPEG, or GIF images are allowed'));
  },
});

/** Accept a single `avatar` field, translating multer errors into ApiErrors. */
export function avatarUpload(req: Request, res: Response, next: NextFunction): void {
  upload.single('avatar')(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') return next(ApiError.tooLarge('Image exceeds the maximum allowed size'));
      return next(ApiError.badRequest(err.message));
    }
    return next(err); // ApiError from the fileFilter, or an unexpected error
  });
}
