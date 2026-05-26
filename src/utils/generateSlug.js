import crypto from "crypto";
import { env } from "../config/env.js";

const slugify = (value) => value
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/(^-|-$)/g, "")
  .slice(0, 60);

export const generateSlug = (title) => {
  const suffix = crypto.randomBytes(Math.ceil(env.EXAM_SLUG_LENGTH / 2)).toString("hex").slice(0, env.EXAM_SLUG_LENGTH);
  return `${slugify(title || "exam")}-${suffix}`;
};
