import Papa from "papaparse";
import { Question } from "./question.model.js";
import { Course } from "../courses/course.model.js";
import { ROLES } from "../../constants/roles.js";
import { ApiError } from "../../utils/ApiError.js";
import { paginationMeta, paginationParams } from "../../utils/pagination.js";
import { recordAudit } from "../audit-logs/auditLog.service.js";
import { questionSchema } from "./question.validation.js";
import { uploadBuffer } from "../../config/cloudinary.js";

const assertCourseAccess = async (user, courseId) => {
  if (user.role !== ROLES.EXAMINER) return;
  if (!await Course.exists({ _id: courseId, examiners: user._id })) throw new ApiError(403, "You are not assigned to this course.");
};
const scope = (user) => user.role === ROLES.EXAMINER ? { createdBy: user._id } : {};
export const list = async (user, query) => {
  const { page, limit, skip, sort } = paginationParams(query);
  const filter = { ...scope(user) };
  for (const key of ["course", "topic", "difficulty", "status", "questionType"]) if (query[key]) filter[key] = query[key];
  const [data, total] = await Promise.all([Question.find(filter).sort(sort).skip(skip).limit(limit), Question.countDocuments(filter)]);
  return { data, meta: paginationMeta(page, limit, total) };
};
export const create = async (req, input) => {
  await assertCourseAccess(req.user, input.course);
  const item = await Question.create({ ...input, createdBy: req.user._id });
  await recordAudit(req, "QUESTION_CREATED", "Question", item._id, "Created question");
  return item;
};
export const get = async (user, id) => {
  const item = await Question.findOne({ _id: id, ...scope(user) }).select("+correctAnswer");
  if (!item) throw new ApiError(404, "Question not found.");
  return item;
};
export const update = async (req, id, input) => {
  const item = await Question.findOneAndUpdate({ _id: id, ...scope(req.user) }, input, { new: true, runValidators: true }).select("+correctAnswer");
  if (!item) throw new ApiError(404, "Question not found.");
  await recordAudit(req, "QUESTION_UPDATED", "Question", item._id, "Updated question");
  return item;
};
export const remove = async (req, id) => update(req, id, { status: "INACTIVE" });
export const addAttachment = async (req, id, file) => {
  const item = await get(req.user, id);
  const asset = await uploadBuffer(file.buffer, "question-assets");
  item.attachments.push({ publicId: asset.public_id, url: asset.secure_url, resourceType: asset.resource_type, originalName: file.originalname });
  await item.save();
  return item;
};
export const bulkImport = async (req) => {
  let rows = req.body.questions;
  if (req.file) {
    const parsed = Papa.parse(req.file.buffer.toString("utf8"), { header: true, skipEmptyLines: true });
    if (parsed.errors.length) throw new ApiError(400, "CSV could not be parsed.", parsed.errors);
    rows = parsed.data.map((row) => ({ ...row, options: JSON.parse(row.options || "[]"), correctAnswer: JSON.parse(row.correctAnswer || "[]") }));
  }
  if (!Array.isArray(rows)) throw new ApiError(400, "Provide a CSV file or questions array.");
  const validated = rows.map((row, index) => {
    const parsed = questionSchema.safeParse(row);
    if (!parsed.success) throw new ApiError(400, "Bulk import validation failed.", [{ row: index + 1, issues: parsed.error.issues }]);
    return parsed.data;
  });
  for (const item of validated) await assertCourseAccess(req.user, item.course);
  const created = await Question.insertMany(validated.map((item) => ({ ...item, createdBy: req.user._id })));
  await recordAudit(req, "QUESTIONS_IMPORTED", "Question", undefined, `Imported ${created.length} questions`);
  return created;
};
