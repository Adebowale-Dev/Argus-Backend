import * as service from "./publicExam.service.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const resolveExamCode = asyncHandler(async (req, res) => res.json(new ApiResponse("Exam code resolved successfully.", await service.resolveExamCode(req.body.examCode))));
export const landing = asyncHandler(async (req, res) => res.json(new ApiResponse("Exam details retrieved successfully.", await service.landing(req.params.slug))));
export const verifyCode = asyncHandler(async (req, res) => res.json(new ApiResponse("Exam access code verified successfully.", await service.verifyCode(req, req.params.slug, req.body.accessCode))));
export const start = asyncHandler(async (req, res) => res.status(201).json(new ApiResponse("Exam attempt started successfully.", await service.start(req, req.params.slug, req.body))));
