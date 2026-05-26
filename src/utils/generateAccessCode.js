import crypto from "crypto";
import { env } from "../config/env.js";

export const generateAccessCode = () => {
  const length = env.EXAM_ACCESS_CODE_LENGTH;
  const min = 10 ** (length - 1);
  const max = 10 ** length - 1;
  return String(crypto.randomInt(min, max + 1));
};
