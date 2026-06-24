import Papa from "papaparse";
import * as XLSX from "xlsx";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
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

const parseAnswerKeys = (value) => {
  const parsed = parseJsonArray(value, null);
  if (parsed) return parsed.map((key) => String(key).trim().toUpperCase()).filter(Boolean);
  if (typeof value !== "string") return [];
  return value.split(",").map((key) => key.trim().toUpperCase()).filter(Boolean);
};

const firstValue = (row, keys) => {
  for (const key of keys) {
    const value = row[key];
    if (value != null && String(value).trim()) return value;
  }
  return undefined;
};

const parseOptions = (row, questionType) => {
  const parsed = parseJsonArray(row.options, null);
  if (parsed) return parsed;
  if (questionType === "TRUE_FALSE") return [{ key: "A", text: "True" }, { key: "B", text: "False" }];
  return ["A", "B", "C", "D", "E", "F"]
    .map((key, index) => ({
      key,
      text: String(firstValue(row, [
        `option${key}`,
        `option${key.toLowerCase()}`,
        `option_${key}`,
        `option_${key.toLowerCase()}`,
        `option${index + 1}`,
        `option_${index + 1}`,
      ]) || "").trim(),
    }))
    .filter((option) => option.text);
};

const parseTags = (value) => {
  if (Array.isArray(value)) return value.map((tag) => String(tag).trim()).filter(Boolean);
  if (typeof value !== "string") return [];
  return value.split(",").map((tag) => tag.trim()).filter(Boolean);
};

const normalizeCsvRow = (row) => {
  const questionType = String(firstValue(row, ["questionType", "questiontype", "question_type", "type"]) || "").trim().toUpperCase();
  return {
    ...row,
    questionBank: firstValue(row, ["questionBank", "questionbank", "question_bank", "bank"]),
    questionText: String(firstValue(row, ["questionText", "questiontext", "question_text", "question", "text"]) || "").trim(),
    questionType,
    options: parseOptions(row, questionType),
    correctAnswer: parseAnswerKeys(firstValue(row, ["correctAnswer", "correctanswer", "correct_answer", "answer", "answers", "correct"])),
    marks: firstValue(row, ["marks", "mark", "points", "score"]),
    topic: firstValue(row, ["topic"])?.trim() || undefined,
    tags: parseTags(row.tags),
    explanation: firstValue(row, ["explanation", "rationale"])?.trim() || undefined,
    status: firstValue(row, ["status"])?.trim() || undefined,
  };
};

const normalizeSpreadsheetRow = (row) => normalizeCsvRow(
  Object.fromEntries(Object.entries(row).map(([key, value]) => [String(key).trim(), value])),
);

const stripBullet = (value) => {
  const text = String(value || "").trim();
  if (/^(?:option\s*)?[A-Fa-f]\s*[).:-]/.test(text) || /^\([A-Fa-f]\)/.test(text)) return text;
  return text.replace(/^(?:[-*•]|\d+[.)])\s*/, "").trim();
};
const parseLabeledValue = (line, labels) => {
  for (const label of labels) {
    const pattern = new RegExp(`^\\s*${label}\\s*(?:\\d+)?\\s*[:.)-]?\\s*(.+)$`, "i");
    const match = line.match(pattern);
    if (match) return match[1].trim();
  }
  return undefined;
};
const optionLine = (line) => {
  const match = line.match(/^\s*(?:option\s*)?(?:\(?([A-Fa-f])\)?)[).:-]\s*(.+)$/i);
  return match ? { key: match[1].toUpperCase(), text: match[2].trim() } : null;
};
const inlineOptions = (line) => {
  const pattern = /(?:^|\s)(?:option\s*)?\(?([A-Fa-f])\)?[).:-]\s*/gi;
  const markers = [...line.matchAll(pattern)];
  const matches = markers.map((marker, index) => {
    const next = markers[index + 1];
    return [marker[1], line.slice(marker.index + marker[0].length, next?.index ?? line.length).trim()];
  });
  return matches
    .map((match) => ({ key: match[0].toUpperCase(), text: match[1].trim() }))
    .filter((option) => option.text);
};
const questionStart = (line) => {
  const labeled = parseLabeledValue(line, ["question", "q"]);
  if (labeled) return labeled;
  const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/);
  return numbered ? numbered[1].trim() : undefined;
};

const isDocumentStyleText = (text) => {
  const hasQuestionLabel = /(^|\n)\s*(?:question|q)\s*\d*\s*[:.)-]/i.test(text);
  const hasNumberedQuestion = /(^|\n)\s*\d+[.)]\s+\S+/i.test(text);
  const hasOptionLabel = /(^|\n)\s*(?:option\s*)?\(?[A-F]\)?[).:-]\s+\S+/i.test(text);
  const hasAnswerLabel = /(^|\n)\s*(?:answer|answers|ans|correct|correct\s+answer|correct\s+option)\s*[:-]?\s+\S+/i.test(text);
  return (hasQuestionLabel || hasNumberedQuestion) && (hasOptionLabel || hasAnswerLabel);
};

const normalizeDocumentText = (text) => String(text || "")
  .replace(/\r/g, "\n")
  .replace(/\bcorrect[ \t]+answer\b/gi, "CorrectAnswer")
  .replace(/\bcorrect[ \t]+option\b/gi, "CorrectOption")
  .replace(/[ \t]+/g, " ")
  .replace(/\s+(?=(?:question|q)\s*\d*\s*[:.)-])/gi, "\n")
  .replace(/\s+(?=(?:option\s*)?\(?[A-F]\)?[).:-]\s+)/gi, "\n")
  .replace(/\s+(?=(?:correctAnswer|correctOption)\s*[:-]?\s+|(?:answer|answers|ans|correct|marks|mark|points|score|topic|tags|explanation|rationale)\s*[:-]\s+)/gi, "\n");

const textBlocksToRows = (text) => {
  const rows = [];
  let current = null;
  const finish = () => {
    if (!current) return;
    rows.push({
      questionType: current.questionType || (current.options.length === 2 && current.options.every((option) => ["TRUE", "FALSE"].includes(option.text.toUpperCase())) ? "TRUE_FALSE" : "SINGLE_SELECT"),
      questionText: current.questionText,
      options: current.options,
      correctAnswer: current.correctAnswer,
      marks: current.marks || 1,
      topic: current.topic,
      tags: current.tags,
      explanation: current.explanation,
    });
    current = null;
  };

  for (const rawLine of normalizeDocumentText(text).split(/\r?\n/)) {
    const line = stripBullet(rawLine);
    if (!line) continue;
    const startedQuestion = questionStart(line);
    if (startedQuestion) {
      finish();
      current = { questionText: startedQuestion, options: [], correctAnswer: [] };
      continue;
    }
    if (!current) current = { questionText: "", options: [], correctAnswer: [] };
    const type = parseLabeledValue(line, ["type", "questionType"]);
    const answer = parseLabeledValue(line, ["correctAnswer", "correctOption", "correct answer", "correct option", "answer", "answers", "ans", "correct"]);
    const marks = parseLabeledValue(line, ["marks", "mark", "points", "score"]);
    const topic = parseLabeledValue(line, ["topic"]);
    const tags = parseLabeledValue(line, ["tags"]);
    const explanation = parseLabeledValue(line, ["explanation", "rationale"]);
    const inline = inlineOptions(line);
    const option = inline.length > 1 ? null : optionLine(line);
    const options = inline.length > 1 ? inline : option ? [option] : [];
    if (type) current.questionType = type.trim().toUpperCase();
    else if (answer) current.correctAnswer = parseAnswerKeys(answer);
    else if (marks) current.marks = marks;
    else if (topic) current.topic = topic;
    else if (tags) current.tags = tags;
    else if (explanation) current.explanation = explanation;
    else if (options.length) current.options.push(...options);
    else if (!current.questionText) current.questionText = line;
    else current.questionText = `${current.questionText} ${line}`;
  }
  finish();
  return rows.map((row) => normalizeCsvRow(row));
};

const parseTextRows = (file) => {
  const text = file.buffer.toString("utf8");
  const name = file.originalname?.toLowerCase() || "";
  const delimiter = name.endsWith(".tsv") || file.mimetype === "text/tab-separated-values" ? "\t" : undefined;
  if (name.endsWith(".txt") && isDocumentStyleText(text)) {
    return textBlocksToRows(text);
  }
  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    delimiter,
    transformHeader: (header) => header.trim(),
  });
  if (parsed.errors.length) {
    if (file.mimetype === "text/plain" || file.originalname?.toLowerCase().endsWith(".txt")) return textBlocksToRows(text);
    throw new ApiError(400, "File could not be parsed.", parsed.errors);
  }
  return parsed.data.map((row) => normalizeCsvRow(row));
};

const parseWorkbookRows = (file) => {
  const workbook = XLSX.read(file.buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new ApiError(400, "Spreadsheet does not contain any sheets.");
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
  return rows.map((row) => normalizeSpreadsheetRow(row));
};

const parseDocxRows = async (file) => {
  const result = await mammoth.extractRawText({ buffer: file.buffer });
  if (!result.value.trim()) throw new ApiError(400, "DOCX file does not contain readable text.");
  return textBlocksToRows(result.value);
};

const parsePdfRows = async (file) => {
  const parser = new PDFParse({ data: file.buffer });
  try {
    const result = await parser.getText();
    if (!result.text.trim()) throw new ApiError(400, "PDF file does not contain readable text.");
    return textBlocksToRows(result.text);
  } finally {
    await parser.destroy();
  }
};

const parseFileRows = async (file) => {
  const name = file.originalname?.toLowerCase() || "";
  const spreadsheetMimeTypes = new Set([
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
  ]);
  if (name.endsWith(".xlsx") || name.endsWith(".xls") || spreadsheetMimeTypes.has(file.mimetype)) return parseWorkbookRows(file);
  if (name.endsWith(".doc")) throw new ApiError(400, "Old .doc files are not supported. Save the file as .docx, PDF, TXT, CSV, or XLSX and try again.");
  if (name.endsWith(".docx") || file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return parseDocxRows(file);
  if (name.endsWith(".pdf") || file.mimetype === "application/pdf") return parsePdfRows(file);
  return parseTextRows(file);
};

const parseImportRows = async (req) => {
  let rows = req.body.questions;
  if (req.file) {
    rows = await parseFileRows(req.file);
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
  const rows = await parseImportRows(req);
  const validated = await validateImportRows(req, rows);
  const created = await Question.insertMany(validated.map((item) => ({ ...item, owner: req.user._id, createdBy: req.user._id })));
  const bankIds = [...new Set(validated.map((item) => item.questionBank).filter(Boolean))];
  await Promise.all(bankIds.map((bankId) => QuestionBank.findByIdAndUpdate(bankId, { $inc: { questionCount: validated.filter((item) => item.questionBank === bankId).length } })));
  await recordAudit(req, "QUESTIONS_IMPORTED", "Question", undefined, `Imported ${created.length} questions`);
  return created;
};

export const previewBulkImport = async (req) => {
  const rows = await parseImportRows(req);
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
  "questionType,questionText,optionA,optionB,optionC,optionD,correctAnswer,marks,topic,tags,explanation",
  "SINGLE_SELECT,\"What does ARGUS primarily provide?\",\"A secure online exam platform\",\"A social media dashboard\",\"A file hosting service\",,A,1,Platform,\"argus,basics\",\"ARGUS is built for secure online examinations.\"",
  "MULTIPLE_CHOICE,\"Which actions can trigger anti-cheat monitoring during an exam?\",\"Tab switching\",\"Fullscreen exit\",\"Typing an answer\",\"Copy attempt\",\"A,B,D\",3,Anti-Cheat,\"monitoring,integrity\",\"Tab switching, fullscreen exit, and copy attempts can all be monitored.\"",
  "TRUE_FALSE,\"A candidate can submit an exam manually before the timer expires.\",,,,,A,1,Attempts,\"candidate,submission\",\"Candidates may submit before time runs out unless the session is already closed.\"",
].join("\n");
