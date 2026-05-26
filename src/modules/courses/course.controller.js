import * as service from "./course.service.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
export const list = asyncHandler(async (req, res) => { const out = await service.list(req.query); res.json(new ApiResponse("Courses retrieved.", out.data, out.meta)); });
export const create = asyncHandler(async (req, res) => res.status(201).json(new ApiResponse("Course created.", await service.create(req, req.body))));
export const get = asyncHandler(async (req, res) => res.json(new ApiResponse("Course retrieved.", await service.get(req.params.id))));
export const update = asyncHandler(async (req, res) => res.json(new ApiResponse("Course updated.", await service.update(req, req.params.id, req.body))));
export const remove = asyncHandler(async (req, res) => res.json(new ApiResponse("Course deactivated.", await service.remove(req, req.params.id))));
