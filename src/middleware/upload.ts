import multer from 'multer';
import { ApiError } from '../utils/apiError.js';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 20,
  },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.has(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new ApiError(400, 'Only JPG, PNG, WebP, and GIF images are allowed', 'INVALID_FILE_TYPE'));
  },
});
