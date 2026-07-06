import multer from "multer";
import { Request } from "express";

// Standard memory storage configuration
const storage = multer.memoryStorage();

// Acceptable file type extensions and MIME mappings
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/rtf",
  "text/rtf",
  "application/vnd.oasis.opendocument.text",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/bmp",
  "image/tiff",
  "image/heic",
  "image/heif"
];

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not allowed. Only PDF, Word documents, and JPEG/PNG images are supported.`));
  }
};

// Unified upload guard configured for maximum safety limits (up to 100MB per batch/file)
export const uploadGuard = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100 MB limit
    files: 20, // max 20 files (useful for merge/batch operations)
  },
});
