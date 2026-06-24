import { QuestionBank } from "./questionBank.model.js";
import { Question } from "../question-bank/question.model.js";
import { Exam } from "../exams/exam.model.js";
import { ROLES } from "../../constants/roles.js";
import { ApiError } from "../../utils/ApiError.js";
import { paginationMeta, paginationParams } from "../../utils/pagination.js";
import { recordAudit } from "../audit-logs/auditLog.service.js";

const scope = (user) => user.role === ROLES.EXAMINER ? { owner: user._id } : {};

export const list = async (user, query) => {
  const { page, limit, skip, sort } = paginationParams(query);
  const filter = scope(user);
  if (query.status) filter.status = query.status;
  if (query.search) filter.$or = [
    { title: new RegExp(query.search, "i") },
    { description: new RegExp(query.search, "i") },
    { tags: new RegExp(query.search, "i") },
  ];
  const [data, total] = await Promise.all([
    QuestionBank.find(filter).populate("owner", "fullName email").sort(sort).skip(skip).limit(limit),
    QuestionBank.countDocuments(filter),
  ]);
  return { data, meta: paginationMeta(page, limit, total) };
};

export const create = async (req, input) => {
  if (req.user.role !== ROLES.EXAMINER) throw new ApiError(403, "Only examiners create question banks.");
  const bank = await QuestionBank.create({ ...input, owner: req.user._id });
  await recordAudit(req, "QUESTION_BANK_CREATED", "QuestionBank", bank._id, "Created question bank");
  return bank;
};

export const get = async (user, id) => {
  const bank = await QuestionBank.findOne({ _id: id, ...scope(user) }).populate("owner", "fullName email");
  if (!bank) throw new ApiError(404, "Question bank not found.");
  const questions = await Question.find({ questionBank: id, status: { $ne: "INACTIVE" } })
    .select("+correctAnswer")
    .sort({ createdAt: -1 });
  return {
    ...bank.toObject(),
    questionCount: questions.length,
    questions,
  };
};

export const update = async (req, id, input) => {
  const bank = await QuestionBank.findOneAndUpdate({ _id: id, ...scope(req.user) }, input, { new: true });
  if (!bank) throw new ApiError(404, "Question bank not found.");
  await recordAudit(req, "QUESTION_BANK_UPDATED", "QuestionBank", bank._id, "Updated question bank");
  return bank;
};

export const remove = async (req, id) => {
  const bank = await QuestionBank.findOneAndUpdate({ _id: id, ...scope(req.user) }, { status: "ARCHIVED", visibility: "ARCHIVED" }, { new: true });
  if (!bank) throw new ApiError(404, "Question bank not found.");
  await recordAudit(req, "QUESTION_BANK_ARCHIVED", "QuestionBank", bank._id, "Archived question bank");
  return bank;
};

export const hardDelete = async (req, id) => {
  const bank = await QuestionBank.findOne({ _id: id, ...scope(req.user) });
  if (!bank) throw new ApiError(404, "Question bank not found.");
  const linkedExams = await Exam.find({ questionBank: bank._id }).select("title").limit(5);
  if (linkedExams.length) {
    const names = linkedExams.map((exam) => exam.title).join(", ");
    throw new ApiError(409, `This question bank is still referenced by ${names}. Unpublishing or archiving keeps the exam data; permanently delete those exams first.`);
  }
  const result = await Question.deleteMany({ questionBank: bank._id, ...scope(req.user) });
  await QuestionBank.deleteOne({ _id: bank._id });
  await recordAudit(req, "QUESTION_BANK_DELETED", "QuestionBank", bank._id, "Permanently deleted question bank");
  return { questionBankId: id, title: bank.title, deletedQuestions: result.deletedCount };
};

export const questions = async (user, id, query) => {
  await get(user, id);
  const { page, limit, skip, sort } = paginationParams(query);
  const filter = { questionBank: id };
  if (query.status) filter.status = query.status;
  const [data, total] = await Promise.all([
    Question.find(filter).sort(sort).skip(skip).limit(limit),
    Question.countDocuments(filter),
  ]);
  return { data, meta: paginationMeta(page, limit, total) };
};
