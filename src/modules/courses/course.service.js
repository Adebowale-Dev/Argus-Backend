import { Course } from "./course.model.js";
import { ApiError } from "../../utils/ApiError.js";
import { paginationMeta, paginationParams } from "../../utils/pagination.js";
import { recordAudit } from "../audit-logs/auditLog.service.js";
export const list = async (query) => { const { page, limit, skip, sort } = paginationParams(query); const filter = query.status ? { status: query.status } : { status: { $ne: "DELETED" } }; if (query.search) filter.title = new RegExp(query.search, "i"); const [data, total] = await Promise.all([Course.find(filter).populate("department", "name code").sort(sort).skip(skip).limit(limit), Course.countDocuments(filter)]); return { data, meta: paginationMeta(page, limit, total) }; };
export const create = async (req, input) => { const item = await Course.create({ ...input, createdBy: req.user._id }); await recordAudit(req, "COURSE_CREATED", "Course", item._id, "Created course"); return item; };
export const get = async (id) => { const item = await Course.findById(id).populate("department examiners candidates", "name code fullName email"); if (!item) throw new ApiError(404, "Course not found."); return item; };
export const update = async (req, id, input) => { const item = await Course.findByIdAndUpdate(id, input, { new: true, runValidators: true }); if (!item) throw new ApiError(404, "Course not found."); await recordAudit(req, "COURSE_UPDATED", "Course", item._id, "Updated course"); return item; };
export const remove = async (req, id) => update(req, id, { status: "DELETED" });
