import { Department } from "./department.model.js";
import { ApiError } from "../../utils/ApiError.js";
import { paginationMeta, paginationParams } from "../../utils/pagination.js";
import { recordAudit } from "../audit-logs/auditLog.service.js";

export const list = async (query) => {
  const { page, limit, skip, sort } = paginationParams(query);
  const filter = query.status ? { status: query.status } : { status: { $ne: "DELETED" } };
  if (query.search) filter.name = new RegExp(query.search, "i");
  const [data, total] = await Promise.all([Department.find(filter).sort(sort).skip(skip).limit(limit), Department.countDocuments(filter)]);
  return { data, meta: paginationMeta(page, limit, total) };
};
export const create = async (req, input) => {
  const item = await Department.create({ ...input, createdBy: req.user._id });
  await recordAudit(req, "DEPARTMENT_CREATED", "Department", item._id, "Created department");
  return item;
};
export const get = async (id) => {
  const item = await Department.findById(id);
  if (!item) throw new ApiError(404, "Department not found.");
  return item;
};
export const update = async (req, id, input) => {
  const item = await Department.findByIdAndUpdate(id, input, { new: true, runValidators: true });
  if (!item) throw new ApiError(404, "Department not found.");
  await recordAudit(req, "DEPARTMENT_UPDATED", "Department", item._id, "Updated department");
  return item;
};
export const remove = async (req, id) => update(req, id, { status: "DELETED" });
