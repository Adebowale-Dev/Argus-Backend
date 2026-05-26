import { v2 as cloudinary } from "cloudinary";
import { env } from "./env.js";
import { ApiError } from "../utils/ApiError.js";

cloudinary.config({ cloud_name: env.CLOUDINARY_CLOUD_NAME, api_key: env.CLOUDINARY_API_KEY, api_secret: env.CLOUDINARY_API_SECRET, secure: true });

export const uploadBuffer = (buffer, folder, authenticated = false) => new Promise((resolve, reject) => {
  if (!env.CLOUDINARY_CLOUD_NAME || env.CLOUDINARY_CLOUD_NAME.startsWith("replace_")) {
    reject(new ApiError(503, "Cloudinary storage is not configured."));
    return;
  }
  const stream = cloudinary.uploader.upload_stream({
    folder: `${env.CLOUDINARY_FOLDER}/${folder}`,
    resource_type: "auto",
    type: authenticated ? "authenticated" : "upload"
  }, (error, result) => error ? reject(error) : resolve(result));
  stream.end(buffer);
});

export const privateEvidenceUrl = (publicId, resourceType = "image") => cloudinary.url(publicId, {
  resource_type: resourceType,
  type: "authenticated",
  sign_url: true,
  secure: true,
  expires_at: Math.floor(Date.now() / 1000) + env.EVIDENCE_SIGNED_URL_EXPIRES_SECONDS
});
