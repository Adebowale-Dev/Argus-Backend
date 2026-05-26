import * as service from "./antiCheat.service.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { antiCheatCsv } from "../reports/report.service.js";
export const log = asyncHandler(async (req, res) => res.status(201).json(new ApiResponse("Anti-cheat event recorded.", await service.logEvent(req, req.params.attemptId, req.body))));
export const attemptLogs = asyncHandler(async (req, res) => { const out = await service.attemptLogs(req, req.params.attemptId, req.query); res.json(new ApiResponse("Anti-cheat logs retrieved.", out.data, out.meta)); });
export const reports = asyncHandler(async (req, res) => {
  if (req.query.format === "csv") return res.type("csv").attachment("anti-cheat-report.csv").send(await antiCheatCsv(req.user, req.params.examId));
  const out = await service.examReports(req, req.params.examId, req.query);
  res.json(new ApiResponse("Anti-cheat report retrieved.", out.data, out.meta));
});
export const snapshot = asyncHandler(async (req, res) => res.status(201).json(new ApiResponse("Snapshot captured.", await service.uploadEvidence(req, req.params.attemptId, "SNAPSHOT_CAPTURED"))));
export const screenshot = asyncHandler(async (req, res) => res.status(201).json(new ApiResponse("Screenshot captured.", await service.uploadEvidence(req, req.params.attemptId, "SCREENSHOT_CAPTURED"))));
export const evidenceUrl = asyncHandler(async (req, res) => res.json(new ApiResponse("Signed evidence URL generated.", await service.evidenceUrl(req, req.params.logId))));
