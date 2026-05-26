import { QuestionBank } from "./questionBank.model.js";
import { Question } from "../question-bank/question.model.js";
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
  return bank;
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
