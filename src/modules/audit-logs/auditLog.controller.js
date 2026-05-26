import { AuditLog } from "./auditLog.model.js";
import { listAuditLogs } from "./auditLog.service.js";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
export const list = asyncHandler(async (req, res) => { const out = await listAuditLogs(req.query); res.json(new ApiResponse("Audit logs retrieved.", out.data, out.meta)); });
export const get = asyncHandler(async (req, res) => { const item = await AuditLog.findById(req.params.id).populate("actor", "fullName email role"); if (!item) throw new ApiError(404, "Audit log not found."); res.json(new ApiResponse("Audit log retrieved.", item)); });
