import { env } from "../../config/env.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { tokenRemainingMs } from "../../utils/generateToken.js";
import * as service from "./auth.service.js";

const cookieOptions = { httpOnly: true, secure: env.COOKIE_SECURE, sameSite: env.COOKIE_SAME_SITE, path: `${env.API_PREFIX}/auth` };
const setRefreshCookie = (res, token) => res.cookie(env.REFRESH_COOKIE_NAME, token, { ...cookieOptions, maxAge: tokenRemainingMs(token) });
const enforceCsrf = (req) => {
  if (env.CSRF_ENABLED && !req.get("x-csrf-token")) {
    const error = new Error("CSRF token is required.");
    error.statusCode = 403;
    throw error;
  }
};

export const login = asyncHandler(async (req, res) => {
  const { refreshToken, ...data } = await service.login(req, req.body);
  setRefreshCookie(res, refreshToken).json(new ApiResponse("Login successful.", data));
});
export const refresh = asyncHandler(async (req, res) => {
  enforceCsrf(req);
  const { refreshToken, ...data } = await service.refresh(req.cookies[env.REFRESH_COOKIE_NAME]);
  setRefreshCookie(res, refreshToken).json(new ApiResponse("Token refreshed.", data));
});
export const logout = asyncHandler(async (req, res) => {
  enforceCsrf(req);
  await service.logout(req.user?._id);
  res.clearCookie(env.REFRESH_COOKIE_NAME, cookieOptions).json(new ApiResponse("Logout successful."));
});
export const me = asyncHandler(async (req, res) => res.json(new ApiResponse("Authenticated user retrieved.", req.user)));
export const forgotPassword = asyncHandler(async (req, res) => {
  await service.forgotPassword(req.body.email);
  res.json(new ApiResponse("If that account exists, a password reset email has been sent."));
});
export const resetPassword = asyncHandler(async (req, res) => {
  await service.resetPassword(req.body);
  res.json(new ApiResponse("Password reset successful."));
});
export const changePassword = asyncHandler(async (req, res) => {
  await service.changePassword(req.user._id, req.body);
  res.json(new ApiResponse("Password changed successfully."));
});
