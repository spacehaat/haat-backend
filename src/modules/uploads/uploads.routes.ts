import { Router } from 'express';
import { ApiError } from '../../utils/apiError.js';
import { imageUpload } from '../../middleware/upload.js';
import { uploadListingImage } from './uploads.service.js';

export const uploadsRouter = Router();

uploadsRouter.post('/uploads/images', imageUpload.array('images', 20), async (req, res) => {
  const files = req.files as Express.Multer.File[] | undefined;
  if (!files?.length) {
    throw new ApiError(400, 'No images provided', 'NO_FILES');
  }

  const listingId = typeof req.body.listingId === 'string' ? req.body.listingId : undefined;
  const items = await Promise.all(files.map((file) => uploadListingImage(file, listingId)));

  res.status(201).json({ items });
});
