import { User } from "../modules/users/user.model.js";
import { verifyAccessToken } from "../utils/generateToken.js";

export const optionalAuthenticate = async (req, _res, next) => {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return next();
    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub);
    if (user && user.status === "ACTIVE") req.user = user;
    return next();
  } catch {
    return next();
  }
};
