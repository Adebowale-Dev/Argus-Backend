import { User } from "../modules/users/user.model.js";
import { ROLES } from "../constants/roles.js";
import { env } from "../config/env.js";

export const seedAdmin = async () => {
  const existing = await User.findOne({ email: env.DEFAULT_ADMIN_EMAIL.toLowerCase() });
  if (existing) return existing;
  return User.create({
    fullName: "ARGUS Super Admin",
    email: env.DEFAULT_ADMIN_EMAIL,
    username: "superadmin",
    password: env.DEFAULT_ADMIN_PASSWORD,
    role: ROLES.SUPER_ADMIN,
    status: "ACTIVE",
    isEmailVerified: true,
    mustChangePassword: true
  });
};
