import * as service from "./questionBank.service.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const list = asyncHandler(async (req, res) => {
  const out = await service.list(req.user, req.query);
  res.json(new ApiResponse("Question banks retrieved.", out.data, out.meta));
});
export const create = asyncHandler(async (req, res) => res.status(201).json(new ApiResponse("Question bank created.", await service.create(req, req.body))));
export const get = asyncHandler(async (req, res) => res.json(new ApiResponse("Question bank retrieved.", await service.get(req.user, req.params.id))));
export const update = asyncHandler(async (req, res) => res.json(new ApiResponse("Question bank updated.", await service.update(req, req.params.id, req.body))));
export const remove = asyncHandler(async (req, res) => res.json(new ApiResponse("Question bank archived.", await service.remove(req, req.params.id))));
export const hardDelete = asyncHandler(async (req, res) => res.json(new ApiResponse("Question bank permanently deleted.", await service.hardDelete(req, req.params.id))));
export const questions = asyncHandler(async (req, res) => {
  const out = await service.questions(req.user, req.params.id, req.query);
  res.json(new ApiResponse("Question bank questions retrieved.", out.data, out.meta));
});
