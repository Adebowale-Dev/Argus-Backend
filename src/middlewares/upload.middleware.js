import multer from "multer";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";

const allowedMimeTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/csv",
  "text/plain",
  "text/tab-separated-values",
  "application/csv",
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const allowedExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".csv",
  ".tsv",
  ".txt",
  ".xls",
  ".xlsx",
  ".docx",
  ".pdf",
]);

const extensionOf = (filename = "") => {
  const match = filename.toLowerCase().match(/\.[^.]+$/);
  return match?.[0] || "";
};

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const extension = extensionOf(file.originalname);
    const isAllowed = allowedMimeTypes.has(file.mimetype) || allowedExtensions.has(extension);
    callback(isAllowed ? null : new ApiError(400, "Unsupported upload type. Use CSV, TSV, TXT, XLS, XLSX, DOCX, PDF, or supported image files."), isAllowed);
  }
});
