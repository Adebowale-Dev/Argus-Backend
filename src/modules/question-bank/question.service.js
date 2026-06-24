import Papa from "papaparse";
import yauzl from "yauzl";
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

const normalizeAnswerKeys = (value) => {
  if (Array.isArray(value)) return value.map((item) => String(item).trim().toUpperCase()).filter(Boolean);
  if (typeof value !== "string") return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  const parsed = parseJsonArray(trimmed, null);
  if (Array.isArray(parsed)) return normalizeAnswerKeys(parsed);
  return trimmed.split(/[,;|]/).map((item) => item.trim().toUpperCase()).filter(Boolean);
};

const normalizeQuestionType = (value) => {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toUpperCase().replace(/[^A-Z]+/g, "_").replace(/^_+|_+$/g, "");
  if (["SINGLE_CHOICE", "SINGLE_SELECT", "ONE_ANSWER"].includes(normalized)) return "SINGLE_SELECT";
  if (["MULTIPLE_CHOICE", "MULTIPLE_SELECT", "MULTI_SELECT"].includes(normalized)) return "MULTIPLE_CHOICE";
  if (["TRUE_FALSE", "TRUE_OR_FALSE"].includes(normalized)) return "TRUE_FALSE";
  return normalized;
};

const optionsFromColumns = (row) => ["A", "B", "C", "D", "E", "F"]
  .map((key) => ({ key, text: row[`option${key}`] || row[`option${key.toLowerCase()}`] || row[key] || row[key.toLowerCase()] }))
  .filter((option) => typeof option.text === "string" && option.text.trim())
  .map((option) => ({ key: option.key, text: option.text.trim() }));

const normalizeCsvRow = (row) => ({
  ...row,
  questionBank: row.questionBank || row.questionbank || row.question_bank,
  questionText: row.questionText || row.questiontext || row.question_text,
  questionType: normalizeQuestionType(row.questionType || row.questiontype || row.question_type),
  options: parseJsonArray(row.options, optionsFromColumns(row)),
  correctAnswer: normalizeAnswerKeys(row.correctAnswer || row.correctanswer || row.correct_answer),
  marks: row.marks,
  topic: row.topic,
  tags: parseTags(row.tags),
  explanation: row.explanation,
  status: row.status,
});

const streamToBuffer = (stream) => new Promise((resolve, reject) => {
  const chunks = [];
  stream.on("data", (chunk) => chunks.push(chunk));
  stream.on("end", () => resolve(Buffer.concat(chunks)));
  stream.on("error", reject);
});

const readDocxEntry = (buffer, entryName) => new Promise((resolve, reject) => {
  yauzl.fromBuffer(buffer, { lazyEntries: true }, (zipError, zipfile) => {
    if (zipError) return reject(zipError);
    zipfile.readEntry();
    zipfile.on("entry", (entry) => {
      if (entry.fileName !== entryName) return zipfile.readEntry();
      zipfile.openReadStream(entry, async (streamError, stream) => {
        if (streamError) return reject(streamError);
        try {
          const entryBuffer = await streamToBuffer(stream);
          zipfile.close();
          resolve(entryBuffer.toString("utf8"));
        } catch (error) {
          reject(error);
        }
      });
    });
    zipfile.on("end", () => resolve(""));
    zipfile.on("error", reject);
  });
});

const decodeXmlEntities = (value) => value
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&amp;/g, "&")
  .replace(/&quot;/g, "\"")
  .replace(/&apos;/g, "'");

const docxXmlToText = (xml) => decodeXmlEntities(
  xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, ""),
);

const splitDocQuestionBlocks = (text) => {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const blocks = [];
  let current = [];
  for (const line of lines) {
    const startsQuestion = /^(?:\d+[).]\s*)?(?:question|q)\s*\d*\s*[:.)-]/i.test(line);
    if (startsQuestion) {
      if (current.length) blocks.push(current);
      current = [line];
      continue;
    }
    if (current.length) {
      current.push(line);
    }
  }
  if (current.length) blocks.push(current);
  return blocks;
};

const parseDocQuestionBlock = (lines, index) => {
  const row = { options: [], tags: [] };
  const extraQuestionLines = [];
  let currentTextField = null;
  for (const line of lines) {
    const optionMatch = line.match(/^([A-F])[).:-]\s*(.+)$/i);
    const fieldMatch = line.match(/^(?:\d+[).]\s*)?(question|q|type|answer|correct answer|marks|mark|topic|tags|explanation)\s*\d*\s*[:.)-]\s*(.*)$/i);
    if (optionMatch) {
      row.options.push({ key: optionMatch[1].toUpperCase(), text: optionMatch[2].trim() });
      currentTextField = null;
    } else if (fieldMatch) {
      const key = fieldMatch[1].toLowerCase();
      const value = fieldMatch[2].trim();
      currentTextField = null;
      if (key === "question" || key === "q") {
        row.questionText = value;
        currentTextField = "questionText";
      }
      if (key === "type") row.questionType = normalizeQuestionType(value);
      if (key === "answer" || key === "correct answer") row.correctAnswer = normalizeAnswerKeys(value);
      if (key === "marks" || key === "mark") row.marks = value;
      if (key === "topic") row.topic = value;
      if (key === "tags") row.tags = parseTags(value);
      if (key === "explanation") {
        row.explanation = value;
        currentTextField = "explanation";
      }
    } else if (!row.questionText) {
      extraQuestionLines.push(line.replace(/^\d+[).]\s*/, ""));
    } else if (currentTextField) {
      row[currentTextField] = `${row[currentTextField]} ${line}`.trim();
    }
  }
  if (!row.questionText && extraQuestionLines.length) row.questionText = extraQuestionLines.join(" ");
  if (row.questionType === "TRUE_FALSE" && row.options.length === 0) {
    row.options = [{ key: "A", text: "True" }, { key: "B", text: "False" }];
  }
  if (!row.marks) row.marks = 1;
  if (row.options.length === 0 && /^(true|false)$/i.test(String(row.correctAnswer?.[0] ?? ""))) {
    row.options = [{ key: "A", text: "True" }, { key: "B", text: "False" }];
    row.correctAnswer = [/^true$/i.test(row.correctAnswer[0]) ? "A" : "B"];
  }
  const optionTextLookup = new Map(row.options.map((option) => [option.text.toLowerCase(), option.key]));
  row.correctAnswer = (row.correctAnswer ?? []).map((answer) => optionTextLookup.get(answer.toLowerCase()) ?? answer);
  if (!row.questionType) {
    const trueFalse = row.options.length === 2 && row.options.every((option) => /^(true|false)$/i.test(option.text));
    row.questionType = trueFalse ? "TRUE_FALSE" : row.correctAnswer.length > 1 ? "MULTIPLE_CHOICE" : "SINGLE_SELECT";
  }
  if (!row.questionText) throw new ApiError(400, "DOCX could not be parsed.", [{ row: index + 1, message: "Question text is required." }]);
  return row;
};

const parseDocxRows = async (file) => {
  const xml = await readDocxEntry(file.buffer, "word/document.xml");
  if (!xml) throw new ApiError(400, "DOCX could not be parsed.", [{ message: "The document body could not be read." }]);
  const text = docxXmlToText(xml);
  const rows = splitDocQuestionBlocks(text).map((block, index) => parseDocQuestionBlock(block, index));
  if (!rows.length) throw new ApiError(400, "DOCX could not be parsed.", [{ message: "No question blocks were found." }]);
  return rows;
};

const parseImportRows = async (req) => {
  let rows = req.body.questions;
  if (req.file) {
    const filename = req.file.originalname.toLowerCase();
    const isDocx = filename.endsWith(".docx") || req.file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (filename.endsWith(".pdf") || req.file.mimetype === "application/pdf") {
      throw new ApiError(400, "PDF import is not supported yet. Upload a DOCX document or a spreadsheet file.");
    }
    if (isDocx) {
      rows = await parseDocxRows(req.file);
    } else {
      const parsed = Papa.parse(req.file.buffer.toString("utf8"), { header: true, skipEmptyLines: true });
      if (parsed.errors.length) throw new ApiError(400, "CSV could not be parsed.", parsed.errors);
      rows = parsed.data.map((row) => normalizeCsvRow(row));
    }
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
  "questionText,questionType,options,correctAnswer,marks,topic,tags,explanation",
  "\"What does ARGUS primarily provide?\",SINGLE_SELECT,\"[{\"\"key\"\":\"\"A\"\",\"\"text\"\":\"\"A secure online exam platform\"\"},{\"\"key\"\":\"\"B\"\",\"\"text\"\":\"\"A social media dashboard\"\"},{\"\"key\"\":\"\"C\"\",\"\"text\"\":\"\"A file hosting service\"\"}]\",\"[\"\"A\"\"]\",1,Platform,\"argus,basics\",\"ARGUS is built for secure online examinations.\"",
  "\"Which actions can trigger anti-cheat monitoring during an exam?\",MULTIPLE_CHOICE,\"[{\"\"key\"\":\"\"A\"\",\"\"text\"\":\"\"Tab switching\"\"},{\"\"key\"\":\"\"B\"\",\"\"text\"\":\"\"Fullscreen exit\"\"},{\"\"key\"\":\"\"C\"\",\"\"text\"\":\"\"Typing an answer\"\"},{\"\"key\"\":\"\"D\"\",\"\"text\"\":\"\"Copy attempt\"\"}]\",\"[\"\"A\"\",\"\"B\"\",\"\"D\"\"]\",3,Anti-Cheat,\"monitoring,integrity\",\"Tab switching, fullscreen exit, and copy attempts can all be monitored.\"",
  "\"A candidate can submit an exam manually before the timer expires.\",TRUE_FALSE,\"[{\"\"key\"\":\"\"A\"\",\"\"text\"\":\"\"True\"\"},{\"\"key\"\":\"\"B\"\",\"\"text\"\":\"\"False\"\"}]\",\"[\"\"A\"\"]\",1,Attempts,\"candidate,submission\",\"Candidates may submit before time runs out unless the session is already closed.\"",
  "\"Which field is commonly required before a public exam attempt starts?\",SINGLE_SELECT,\"[{\"\"key\"\":\"\"A\"\",\"\"text\"\":\"\"Favorite color\"\"},{\"\"key\"\":\"\"B\"\",\"\"text\"\":\"\"Candidate identity details\"\"},{\"\"key\"\":\"\"C\"\",\"\"text\"\":\"\"Operating system license key\"\"}]\",\"[\"\"B\"\"]\",2,Candidate Intake,\"identity,public-exam\",\"Public exam flows often collect identity details like name or email.\"",
  "\"Select the valid examiner workflows in ARGUS.\",MULTIPLE_CHOICE,\"[{\"\"key\"\":\"\"A\"\",\"\"text\"\":\"\"Create a question bank\"\"},{\"\"key\"\":\"\"B\"\",\"\"text\"\":\"\"Publish an exam\"\"},{\"\"key\"\":\"\"C\"\",\"\"text\"\":\"\"View attempt reports\"\"},{\"\"key\"\":\"\"D\"\",\"\"text\"\":\"\"Promote users to super admin\"\"}]\",\"[\"\"A\"\",\"\"B\"\",\"\"C\"\"]\",4,Exam Management,\"examiner,workflow\",\"Examiners can create banks, publish exams, and review attempts, but cannot promote super admins.\"",
].join("\n");

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const crc32 = (buffer) => {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const dosDateTime = (date = new Date()) => {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = Math.max(date.getFullYear(), 1980) - 1980;
  return { date: (year << 9) | (month << 5) | day, time };
};

const zipStore = (files) => {
  const now = dosDateTime();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name);
    const content = Buffer.from(file.content);
    const checksum = crc32(content);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(now.time, 10);
    localHeader.writeUInt16LE(now.date, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(content.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, content);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(now.time, 12);
    centralHeader.writeUInt16LE(now.date, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(content.length, 20);
    centralHeader.writeUInt32LE(content.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, name);

    offset += localHeader.length + name.length + content.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
};

const xmlEscape = (value) => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const docParagraph = (text) => `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;

export const importTemplateDocx = () => {
  const lines = [
    "ARGUS Question Import Template",
    "",
    "Question: What does ARGUS primarily provide?",
    "Type: Single Choice",
    "A) A secure online exam platform",
    "B) A social media dashboard",
    "C) A file hosting service",
    "Answer: A",
    "Marks: 1",
    "Topic: Platform",
    "Tags: argus, basics",
    "Explanation: ARGUS is built for secure online examinations.",
    "",
    "Question: Which actions can trigger anti-cheat monitoring during an exam?",
    "Type: Multiple Choice",
    "A) Tab switching",
    "B) Fullscreen exit",
    "C) Typing an answer",
    "D) Copy attempt",
    "Answer: A,B,D",
    "Marks: 3",
    "Topic: Anti-Cheat",
    "Tags: monitoring, integrity",
    "",
    "Question: A candidate can submit an exam manually before the timer expires.",
    "Type: True/False",
    "Answer: A",
    "Marks: 1",
    "Explanation: For true/false questions, A means True and B means False.",
  ];

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${lines.map(docParagraph).join("\n    ")}
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body>
</w:document>`;

  return zipStore([
    {
      name: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
    },
    {
      name: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
    },
    { name: "word/document.xml", content: documentXml },
  ]);
};
