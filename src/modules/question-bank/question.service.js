import Papa from "papaparse";
import { Question } from "./question.model.js";
import { QuestionBank } from "../question-banks/questionBank.model.js";
import { ROLES } from "../../constants/roles.js";
import { ApiError } from "../../utils/ApiError.js";
import { paginationMeta, paginationParams } from "../../utils/pagination.js";
import { recordAudit } from "../audit-logs/auditLog.service.js";
import { questionSchema } from "./question.validation.js";
import { uploadBuffer } from "../../config/cloudinary.js";

const parseJsonArray = (value, fallback = []) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  try {
    return JSON.parse(trimmed);
  } catch {
    return fallback;
  }
};

const parseTags = (value) => {
  if (Array.isArray(value)) return value.map((tag) => String(tag).trim()).filter(Boolean);
  if (typeof value !== "string") return [];
  return value.split(",").map((tag) => tag.trim()).filter(Boolean);
};

const normalizeCsvRow = (row) => ({
  ...row,
  questionBank: row.questionBank || row.questionbank || row.question_bank,
  questionText: row.questionText || row.questiontext || row.question_text,
  questionType: row.questionType || row.questiontype || row.question_type,
  options: parseJsonArray(row.options),
  correctAnswer: parseJsonArray(row.correctAnswer || row.correctanswer || row.correct_answer),
  marks: row.marks,
  topic: row.topic,
  tags: parseTags(row.tags),
  explanation: row.explanation,
  status: row.status,
});

const parseImportRows = (req) => {
  let rows = req.body.questions;
  if (req.file) {
    const parsed = Papa.parse(req.file.buffer.toString("utf8"), { header: true, skipEmptyLines: true });
    if (parsed.errors.length) throw new ApiError(400, "CSV could not be parsed.", parsed.errors);
    rows = parsed.data.map((row) => normalizeCsvRow(row));
  }
  if (!Array.isArray(rows)) throw new ApiError(400, "Provide a CSV file or questions array.");
  return rows;
};

const validateImportRows = async (req, rows) => {
  const fallbackQuestionBank = req.get("x-question-bank");
  const rowErrors = [];
  const validated = rows.map((row, index) => {
    const parsed = questionSchema.safeParse({ ...row, questionBank: row.questionBank || fallbackQuestionBank });
    if (!parsed.success) {
      rowErrors.push({ row: index + 1, issues: parsed.error.issues });
      return null;
    }
    return parsed.data;
  });
  if (rowErrors.length) throw new ApiError(400, "Bulk import validation failed.", rowErrors);
  for (const item of validated) {
    await assertQuestionBankAccess(req.user, item.questionBank);
  }
  return validated;
};

const assertQuestionBankAccess = async (user, questionBankId) => {
  if (!questionBankId) return;
  if (user.role !== ROLES.EXAMINER) return;
  if (!await QuestionBank.exists({ _id: questionBankId, owner: user._id, status: "ACTIVE" })) throw new ApiError(403, "You cannot add questions to this question bank.");
};
const scope = (user) => user.role === ROLES.EXAMINER ? { $or: [{ owner: user._id }, { createdBy: user._id }] } : {};
export const list = async (user, query) => {
  const { page, limit, skip, sort } = paginationParams(query);
  const filter = { ...scope(user) };
  for (const key of ["questionBank", "topic", "status", "questionType"]) if (query[key]) filter[key] = query[key];
  if (query.bank) filter.questionBank = query.bank;
  if (query.tag) filter.tags = query.tag;
  const questionQuery = Question.find(filter).sort(sort).skip(skip).limit(limit);
  if (user.role === ROLES.EXAMINER || user.role === ROLES.SUPER_ADMIN || user.role === ROLES.SUB_ADMIN) {
    questionQuery.select("+correctAnswer");
  }
  const [data, total] = await Promise.all([questionQuery, Question.countDocuments(filter)]);
  return { data, meta: paginationMeta(page, limit, total) };
};
export const create = async (req, input) => {
  await assertQuestionBankAccess(req.user, input.questionBank);
  const item = await Question.create({ ...input, owner: req.user._id, createdBy: req.user._id });
  if (input.questionBank) await QuestionBank.findByIdAndUpdate(input.questionBank, { $inc: { questionCount: 1 } });
  await recordAudit(req, "QUESTION_CREATED", "Question", item._id, "Created question");
  return item;
};
export const get = async (user, id) => {
  const item = await Question.findOne({ _id: id, ...scope(user) }).select("+correctAnswer");
  if (!item) throw new ApiError(404, "Question not found.");
  return item;
};
export const update = async (req, id, input) => {
  if (input.questionBank) await assertQuestionBankAccess(req.user, input.questionBank);
  const existing = await Question.findOne({ _id: id, ...scope(req.user) }).select("questionBank status");
  if (!existing) throw new ApiError(404, "Question not found.");
  const item = await Question.findOneAndUpdate({ _id: id, ...scope(req.user) }, input, { new: true, runValidators: true }).select("+correctAnswer");
  if (!item) throw new ApiError(404, "Question not found.");
  if (input.questionBank && String(existing.questionBank || "") !== String(input.questionBank)) {
    if (existing.questionBank) await QuestionBank.findByIdAndUpdate(existing.questionBank, { $inc: { questionCount: -1 } });
    await QuestionBank.findByIdAndUpdate(input.questionBank, { $inc: { questionCount: 1 } });
  }
  await recordAudit(req, "QUESTION_UPDATED", "Question", item._id, "Updated question");
  return item;
};
export const remove = async (req, id) => {
  const existing = await Question.findOne({ _id: id, ...scope(req.user) }).select("questionBank status");
  if (!existing) throw new ApiError(404, "Question not found.");
  if (existing.status === "INACTIVE") return existing;
  const item = await Question.findOneAndUpdate(
    { _id: id, ...scope(req.user) },
    { status: "INACTIVE" },
    { new: true, runValidators: true },
  ).select("+correctAnswer");
  if (!item) throw new ApiError(404, "Question not found.");
  if (existing.questionBank) {
    await QuestionBank.findByIdAndUpdate(existing.questionBank, { $inc: { questionCount: -1 } });
  }
  await recordAudit(req, "QUESTION_UPDATED", "Question", item._id, "Deactivated question");
  return item;
};
export const addAttachment = async (req, id, file) => {
  if (!file) throw new ApiError(400, "A question attachment file is required.");
  const item = await get(req.user, id);
  const asset = await uploadBuffer(file.buffer, "question-assets");
  item.attachments.push({ publicId: asset.public_id, url: asset.secure_url, resourceType: asset.resource_type, originalName: file.originalname });
  await item.save();
  return item;
};
export const bulkImport = async (req) => {
  const rows = parseImportRows(req);
  const validated = await validateImportRows(req, rows);
  const created = await Question.insertMany(validated.map((item) => ({ ...item, owner: req.user._id, createdBy: req.user._id })));
  const bankIds = [...new Set(validated.map((item) => item.questionBank).filter(Boolean))];
  await Promise.all(bankIds.map((bankId) => QuestionBank.findByIdAndUpdate(bankId, { $inc: { questionCount: validated.filter((item) => item.questionBank === bankId).length } })));
  await recordAudit(req, "QUESTIONS_IMPORTED", "Question", undefined, `Imported ${created.length} questions`);
  return created;
};

export const previewBulkImport = async (req) => {
  const rows = parseImportRows(req);
  const validated = await validateImportRows(req, rows);
  return validated.map((item, index) => ({
    row: index + 1,
    questionText: item.questionText,
    questionType: item.questionType,
    marks: item.marks,
    topic: item.topic,
    optionCount: item.options.length,
    correctAnswer: item.correctAnswer,
    tags: item.tags,
  }));
};

export const cloneQuestions = async (req, input) => {
  await assertQuestionBankAccess(req.user, input.questionBank);
  const sourceQuestions = await Question.find({ _id: { $in: input.sourceQuestionIds }, ...scope(req.user) }).select("+correctAnswer");
  if (sourceQuestions.length !== input.sourceQuestionIds.length) throw new ApiError(404, "Some source questions could not be found.");
  const payload = sourceQuestions.map((question) => ({
    questionBank: input.questionBank,
    questionText: question.questionText,
    questionType: question.questionType,
    options: question.options,
    correctAnswer: question.correctAnswer,
    marks: question.marks,
    topic: question.topic,
    tags: question.tags,
    explanation: question.explanation,
    attachments: question.attachments,
    status: "ACTIVE",
    owner: req.user._id,
    createdBy: req.user._id,
  }));
  const created = await Question.insertMany(payload);
  await QuestionBank.findByIdAndUpdate(input.questionBank, { $inc: { questionCount: created.length } });
  await recordAudit(req, "QUESTIONS_CLONED", "Question", undefined, `Copied ${created.length} questions into another bank`);
  return created;
};

export const importTemplate = () => [
  "questionText,questionType,options,correctAnswer,marks,topic,tags,explanation",
  "\"What does ARGUS primarily provide?\",SINGLE_SELECT,\"[{\"\"key\"\":\"\"A\"\",\"\"text\"\":\"\"A secure online exam platform\"\"},{\"\"key\"\":\"\"B\"\",\"\"text\"\":\"\"A social media dashboard\"\"},{\"\"key\"\":\"\"C\"\",\"\"text\"\":\"\"A file hosting service\"\"}]\",\"[\"\"A\"\"]\",1,Platform,\"argus,basics\",\"ARGUS is built for secure online examinations.\"",
  "\"Which actions can trigger anti-cheat monitoring during an exam?\",MULTIPLE_CHOICE,\"[{\"\"key\"\":\"\"A\"\",\"\"text\"\":\"\"Tab switching\"\"},{\"\"key\"\":\"\"B\"\",\"\"text\"\":\"\"Fullscreen exit\"\"},{\"\"key\"\":\"\"C\"\",\"\"text\"\":\"\"Typing an answer\"\"},{\"\"key\"\":\"\"D\"\",\"\"text\"\":\"\"Copy attempt\"\"}]\",\"[\"\"A\"\",\"\"B\"\",\"\"D\"\"]\",3,Anti-Cheat,\"monitoring,integrity\",\"Tab switching, fullscreen exit, and copy attempts can all be monitored.\"",
  "\"A candidate can submit an exam manually before the timer expires.\",TRUE_FALSE,\"[{\"\"key\"\":\"\"A\"\",\"\"text\"\":\"\"True\"\"},{\"\"key\"\":\"\"B\"\",\"\"text\"\":\"\"False\"\"}]\",\"[\"\"A\"\"]\",1,Attempts,\"candidate,submission\",\"Candidates may submit before time runs out unless the session is already closed.\"",
  "\"Which field is commonly required before a public exam attempt starts?\",SINGLE_SELECT,\"[{\"\"key\"\":\"\"A\"\",\"\"text\"\":\"\"Favorite color\"\"},{\"\"key\"\":\"\"B\"\",\"\"text\"\":\"\"Candidate identity details\"\"},{\"\"key\"\":\"\"C\"\",\"\"text\"\":\"\"Operating system license key\"\"}]\",\"[\"\"B\"\"]\",2,Candidate Intake,\"identity,public-exam\",\"Public exam flows often collect identity details like name or email.\"",
  "\"Select the valid examiner workflows in ARGUS.\",MULTIPLE_CHOICE,\"[{\"\"key\"\":\"\"A\"\",\"\"text\"\":\"\"Create a question bank\"\"},{\"\"key\"\":\"\"B\"\",\"\"text\"\":\"\"Publish an exam\"\"},{\"\"key\"\":\"\"C\"\",\"\"text\"\":\"\"View attempt reports\"\"},{\"\"key\"\":\"\"D\"\",\"\"text\"\":\"\"Promote users to super admin\"\"}]\",\"[\"\"A\"\",\"\"B\"\",\"\"C\"\"]\",4,Exam Management,\"examiner,workflow\",\"Examiners can create banks, publish exams, and review attempts, but cannot promote super admins.\"",
].join("\n");
