import * as service from "./dashboard.service.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const admin = asyncHandler(async (req, res) => res.json(new ApiResponse("Admin dashboard retrieved.", await service.adminDashboard(req.user))));
export const examiner = asyncHandler(async (req, res) => res.json(new ApiResponse("Examiner dashboard retrieved.", await service.examinerDashboard(req.user))));
export const candidate = asyncHandler(async (req, res) => res.json(new ApiResponse("Candidate dashboard retrieved.", await service.candidateDashboard(req.user))));
