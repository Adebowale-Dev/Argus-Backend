import crypto from "crypto";
import { env } from "../config/env.js";

export const hashAccessCode = (accessCode) => crypto
  .createHmac("sha256", env.ACCESS_CODE_HASH_SECRET)
  .update(String(accessCode))
  .digest("hex");

export const compareAccessCode = (accessCode, hash) => crypto.timingSafeEqual(
  Buffer.from(hashAccessCode(accessCode)),
  Buffer.from(hash)
);
