import type { ErrorRequestHandler } from 'express';
import multer from 'multer';
import { ApiError } from '../utils/apiError.js';
import { ZodError } from 'zod';

export const errorMiddleware: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'Image must be 10 MB or smaller'
        : err.code === 'LIMIT_FILE_COUNT'
          ? 'Too many images in one upload'
          : err.message;
    return res.status(400).json({
      error: { message, code: 'UPLOAD_ERROR', details: { code: err.code } },
    });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        message: 'Validation error',
        code: 'VALIDATION_ERROR',
        details: err.flatten(),
      },
    });
  }

  if (err instanceof ApiError) {
    return res.status(err.status).json({
      error: {
        message: err.message,
        code: err.code,
        details: err.details,
      },
    });
  }

  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).json({
    error: {
      message: 'Internal server error',
      code: 'INTERNAL_SERVER_ERROR',
    },
  });
};

