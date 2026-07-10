import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { s3 } from '../../config/s3.js';
import { env } from '../../config/env.js';

const MIME_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

function fileExtension(file: Express.Multer.File) {
  const fromName = path.extname(file.originalname || '').toLowerCase();
  if (fromName && fromName.length <= 5) return fromName;
  return MIME_EXT[file.mimetype] || '.jpg';
}

function publicUrl(key: string) {
  if (env.AWS_S3_PUBLIC_URL) {
    const base = env.AWS_S3_PUBLIC_URL.replace(/\/$/, '');
    return `${base}/${key}`;
  }
  return `https://${env.AWS_S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${key}`;
}

export async function uploadBuffer(
  key: string,
  body: Buffer,
  contentType: string,
) {
  await s3.send(
    new PutObjectCommand({
      Bucket: env.AWS_S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return { key, url: publicUrl(key) };
}

export async function uploadProposalPdf(proposalId: string, buffer: Buffer) {
  const folder = env.AWS_S3_FOLDER.replace(/\/$/, '');
  const key = `${folder}/proposals/${proposalId}/${randomUUID()}.pdf`;
  return uploadBuffer(key, buffer, 'application/pdf');
}

export async function downloadBuffer(key: string) {
  const res = await s3.send(
    new GetObjectCommand({
      Bucket: env.AWS_S3_BUCKET,
      Key: key,
    }),
  );
  if (!res.Body) throw new Error('Empty S3 object');
  return Buffer.from(await res.Body.transformToByteArray());
}

export async function uploadListingImage(file: Express.Multer.File, listingId?: string) {
  const folder = env.AWS_S3_FOLDER.replace(/\/$/, '');
  const listingPart = listingId ? `${listingId}/` : '';
  const key = `${folder}/${listingPart}${randomUUID()}${fileExtension(file)}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: env.AWS_S3_BUCKET,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    }),
  );

  return { key, url: publicUrl(key) };
}