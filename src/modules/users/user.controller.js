import * as service from "./user.service.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const list = asyncHandler(async (req, res) => {
  const result = await service.listUsers(req.user, req.query);
  res.json(new ApiResponse("Users retrieved.", result.data, result.meta));
});
export const create = asyncHandler(async (req, res) => res.status(201).json(new ApiResponse("User created.", await service.createUser(req, req.body))));
export const get = asyncHandler(async (req, res) => res.json(new ApiResponse("User retrieved.", await service.getUser(req.user, req.params.id))));
export const update = asyncHandler(async (req, res) => res.json(new ApiResponse("User updated.", await service.updateUser(req, req.params.id, req.body))));
export const role = asyncHandler(async (req, res) => res.json(new ApiResponse("Role updated.", await service.changeRole(req, req.params.id, req.body))));
export const block = asyncHandler(async (req, res) => res.json(new ApiResponse("User blocked.", await service.setBlocked(req, req.params.id, true, req.body.reason))));
export const unblock = asyncHandler(async (req, res) => res.json(new ApiResponse("User unblocked.", await service.setBlocked(req, req.params.id, false))));
export const remove = asyncHandler(async (req, res) => { await service.deleteUser(req, req.params.id); res.json(new ApiResponse("User deleted.")); });
export const passwordReset = asyncHandler(async (req, res) => { await service.resetUserPassword(req, req.params.id, req.body.temporaryPassword); res.json(new ApiResponse("Temporary password assigned.")); });
