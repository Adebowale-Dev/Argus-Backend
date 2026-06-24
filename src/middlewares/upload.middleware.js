import multer from "multer";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const allowed = /^(image\/(png|jpeg|webp)|text\/(csv|plain|tab-separated-values)|application\/(pdf|vnd\.ms-excel|vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|vnd\.openxmlformats-officedocument\.wordprocessingml\.document))$/;
    callback(allowed.test(file.mimetype) ? null : new ApiError(400, "Unsupported upload type."), allowed.test(file.mimetype));
  }
});
