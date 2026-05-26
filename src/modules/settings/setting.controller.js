import * as service from "./setting.service.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
export const list = asyncHandler(async (req, res) => { const out = await service.list(req.query); res.json(new ApiResponse("Settings retrieved.", out.data, out.meta)); });
export const update = asyncHandler(async (req, res) => res.json(new ApiResponse("Setting updated.", await service.update(req, req.params.key, req.body))));
