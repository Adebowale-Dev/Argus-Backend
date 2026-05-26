import { Setting } from "./setting.model.js";
import { ROLES } from "../../constants/roles.js";
import { ApiError } from "../../utils/ApiError.js";
import { recordAudit } from "../audit-logs/auditLog.service.js";
import { paginationMeta, paginationParams } from "../../utils/pagination.js";
const restrictedCategories = ["SECURITY", "AUTH", "OWNERSHIP", "SEED"];
export const list = async (query) => { const { page, limit, skip, sort } = paginationParams(query); const filter = query.category ? { category: query.category } : {}; const [data, total] = await Promise.all([Setting.find(filter).sort(sort).skip(skip).limit(limit), Setting.countDocuments(filter)]); return { data, meta: paginationMeta(page, limit, total) }; };
export const update = async (req, key, input) => {
  const item = await Setting.findOne({ key });
  if (!item) throw new ApiError(404, "Setting not found.");
  if (req.user.role === ROLES.SUB_ADMIN && restrictedCategories.includes(item.category)) throw new ApiError(403, "This setting is reserved for the super admin.");
  Object.assign(item, input, { updatedBy: req.user._id });
  await item.save();
  await recordAudit(req, "SETTING_CHANGED", "Setting", item._id, `Updated setting ${key}`);
  return item;
};
