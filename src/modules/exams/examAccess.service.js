import { env } from "../../config/env.js";
import { generateAccessCode } from "../../utils/generateAccessCode.js";
import { generateExamCodeCandidate } from "../../utils/generateExamCode.js";
import { generateSlug } from "../../utils/generateSlug.js";
import { hashAccessCode } from "../../utils/hashAccessCode.js";
import { Exam } from "./exam.model.js";

export const buildPublicUrl = (_slug, examCode) => `${env.PUBLIC_EXAM_URL.replace(/\/$/, "")}?code=${examCode}`;

export const ensureExamLink = async (exam) => {
  if (!exam.code) await ensureExamCode(exam);
  if (!exam.publicSlug) {
    exam.publicSlug = generateSlug(exam.title);
  }
  exam.publicUrl = buildPublicUrl(exam.publicSlug, exam.code);
  return exam;
};

export const ensureExamCode = async (exam) => {
  if (exam.code) return exam.code;
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const code = generateExamCodeCandidate();
    if (!await Exam.exists({ code, _id: { $ne: exam._id } })) {
      exam.code = code;
      return exam.code;
    }
  }
  throw new Error("Unable to generate a unique exam code.");
};

export const generateExamCode = (exam) => {
  const accessCode = generateAccessCode();
  exam.accessCodeHash = hashAccessCode(accessCode);
  exam.accessCodeLastGeneratedAt = new Date();
  exam.accessCodeRegeneratedCount = (exam.accessCodeRegeneratedCount || 0) + 1;
  return accessCode;
};

export const regenerateExamLink = async (exam) => {
  if (!exam.code) await ensureExamCode(exam);
  exam.publicSlug = generateSlug(exam.title);
  exam.publicUrl = buildPublicUrl(exam.publicSlug, exam.code);
  return exam;
};
