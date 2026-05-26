import { ROLES } from "../constants/roles.js";
import { ApiError } from "../utils/ApiError.js";

export const requirePermission = (...permissions) => (req, _res, next) => {
  if (req.user?.role === ROLES.SUPER_ADMIN) return next();
  if (!permissions.every((permission) => req.user?.permissions?.includes(permission))) {
    return next(new ApiError(403, "Required permission is missing."));
  }
  next();
};
