import { User } from "../modules/users/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { verifyAccessToken } from "../utils/generateToken.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const authenticate = asyncHandler(async (req, _res, next) => {
  const token = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null;
  if (!token) throw new ApiError(401, "Authentication required.");
  let payload;
  try { payload = verifyAccessToken(token); } catch { throw new ApiError(401, "Invalid or expired access token."); }
  const user = await User.findById(payload.sub);
  if (!user || user.status !== "ACTIVE") throw new ApiError(401, "Account is unavailable.");
  req.user = user;
  next();
});
