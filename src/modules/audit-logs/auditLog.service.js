import { AuditLog } from "./auditLog.model.js";
import { paginationMeta, paginationParams } from "../../utils/pagination.js";

export const recordAudit = (req, action, resourceType, resourceId, description, metadata = {}) => AuditLog.create({
  actor: req.user?._id, actorRole: req.user?.role, action, resourceType, resourceId, description, metadata,
  ipAddress: req.ip, userAgent: req.get?.("user-agent")
});

export const listAuditLogs = async (query) => {
  const { page, limit, skip, sort } = paginationParams(query);
  const filter = query.action ? { action: query.action } : {};
  const [data, total] = await Promise.all([AuditLog.find(filter).sort(sort).skip(skip).limit(limit).populate("actor", "fullName email role"), AuditLog.countDocuments(filter)]);
  return { data, meta: paginationMeta(page, limit, total) };
};
