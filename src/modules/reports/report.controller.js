import * as service from "./report.service.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
export const dashboard = asyncHandler(async (req, res) => res.json(new ApiResponse("Dashboard statistics retrieved.", await service.dashboard(req.user))));
export const results = asyncHandler(async (req, res) => { const out = await service.results(req.user, req.params.examId, req.query); if (out.csv !== undefined) return res.type("csv").attachment("exam-results.csv").send(out.csv); res.json(new ApiResponse("Exam results retrieved.", out.data, out.meta)); });
export const antiCheatExport = asyncHandler(async (req, res) => res.type("csv").attachment("anti-cheat-report.csv").send(await service.antiCheatCsv(req.user, req.params.examId)));
export const examinerOverview = asyncHandler(async (req, res) => res.json(new ApiResponse("Examiner assessment report retrieved.", await service.examinerOverview(req.user))));
