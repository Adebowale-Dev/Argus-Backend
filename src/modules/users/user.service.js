import { User } from "./user.model.js";
import { ROLES } from "../../constants/roles.js";
import { PERMISSIONS } from "../../constants/permissions.js";
import { ApiError } from "../../utils/ApiError.js";
import { paginationMeta, paginationParams } from "../../utils/pagination.js";
import { recordAudit } from "../audit-logs/auditLog.service.js";
import { sendAccountBlockedEmail, sendAdminCreatedEmail, sendCandidateCreatedEmail, sendExaminerCreatedEmail, sendSubAdminCreatedEmail, sendWelcomeEmail } from "../../emails/email.service.js";

const assertManageTarget = (actor, targetRole) => {
  if (actor.role === ROLES.SUPER_ADMIN) return;
  if (actor.role !== ROLES.SUB_ADMIN) throw new ApiError(403, "User management is restricted.");
  if ([ROLES.SUPER_ADMIN, ROLES.SUB_ADMIN].includes(targetRole)) throw new ApiError(403, "Sub-admins cannot manage administrator accounts.");
};
const assertPermissionForRole = (actor, role) => {
  if (actor.role === ROLES.SUPER_ADMIN) return;
  const needed = role === ROLES.EXAMINER ? PERMISSIONS.MANAGE_EXAMINERS : PERMISSIONS.MANAGE_CANDIDATES;
  if (!actor.permissions.includes(needed)) throw new ApiError(403, "Required user management permission is missing.");
};

const visibleRoles = (actor) => {
  if (actor.role === ROLES.SUPER_ADMIN) return undefined;
  if (actor.role === ROLES.EXAMINER) return [ROLES.CANDIDATE];
  const roles = [];
  if (actor.permissions.includes(PERMISSIONS.MANAGE_EXAMINERS)) roles.push(ROLES.EXAMINER);
  if (actor.permissions.includes(PERMISSIONS.MANAGE_CANDIDATES)) roles.push(ROLES.CANDIDATE);
  return roles;
};

export const listUsers = async (actor, query) => {
  const { page, limit, skip, sort } = paginationParams(query);
  const filter = {};
  const permittedRoles = visibleRoles(actor);
  if (permittedRoles) {
    if (!permittedRoles.length) return { data: [], meta: paginationMeta(page, limit, 0) };
    if (query.role && !permittedRoles.includes(query.role)) return { data: [], meta: paginationMeta(page, limit, 0) };
    filter.role = query.role && permittedRoles.includes(query.role) ? query.role : { $in: permittedRoles };
  }
  if (query.status) filter.status = query.status;
  if (query.role && !permittedRoles) filter.role = query.role;
  if (query.search) filter.$or = [{ fullName: new RegExp(query.search, "i") }, { email: new RegExp(query.search, "i") }, { username: new RegExp(query.search, "i") }];
  const [data, total] = await Promise.all([User.find(filter).sort(sort).skip(skip).limit(limit), User.countDocuments(filter)]);
  return { data, meta: paginationMeta(page, limit, total) };
};
export const getUser = async (actor, id) => {
  const user = await User.findById(id);
  if (!user) throw new ApiError(404, "User not found.");
  if (actor.role === ROLES.EXAMINER) {
    if (user.role !== ROLES.CANDIDATE) throw new ApiError(403, "Examiners can only view candidate accounts.");
    return user;
  }
  assertManageTarget(actor, user.role);
  assertPermissionForRole(actor, user.role);
  return user;
};
export const createUser = async (req, input) => {
  assertManageTarget(req.user, input.role);
  assertPermissionForRole(req.user, input.role);
  if (input.role === ROLES.SUPER_ADMIN && req.user.role !== ROLES.SUPER_ADMIN) throw new ApiError(403, "Only a super admin may create administrators.");
  if (input.role !== ROLES.SUB_ADMIN) input.permissions = [];
  const user = await User.create({ ...input, createdBy: req.user._id, mustChangePassword: true });
  const mails = { [ROLES.SUPER_ADMIN]: sendAdminCreatedEmail, [ROLES.SUB_ADMIN]: sendSubAdminCreatedEmail, [ROLES.EXAMINER]: sendExaminerCreatedEmail, [ROLES.CANDIDATE]: sendCandidateCreatedEmail };
  await Promise.all([sendWelcomeEmail(user), mails[user.role](user, input.password)]);
  await recordAudit(req, "USER_CREATED", "User", user._id, `Created ${user.role} account`);
  return user;
};
export const updateUser = async (req, id, input) => {
  const user = await User.findById(id);
  if (!user) throw new ApiError(404, "User not found.");
  assertManageTarget(req.user, user.role);
  assertPermissionForRole(req.user, user.role);
  if (input.permissions && (user.role !== ROLES.SUB_ADMIN || req.user.role !== ROLES.SUPER_ADMIN)) throw new ApiError(403, "Only super admins assign sub-admin permissions.");
  Object.assign(user, input);
  await user.save();
  await recordAudit(req, "USER_UPDATED", "User", user._id, "Updated user account");
  return user;
};
export const changeRole = async (req, id, input) => {
  const user = await User.findById(id);
  if (!user) throw new ApiError(404, "User not found.");
  if (req.user.role !== ROLES.SUPER_ADMIN) throw new ApiError(403, "Only a super admin may change roles.");
  if (String(user._id) === String(req.user._id)) throw new ApiError(400, "You cannot change your own administrative role.");
  user.role = input.role;
  user.permissions = input.role === ROLES.SUB_ADMIN ? (input.permissions || []) : [];
  await user.save();
  await recordAudit(req, "ROLE_CHANGED", "User", user._id, `Changed role to ${input.role}`);
  return user;
};
export const setBlocked = async (req, id, blocked, reason) => {
  const user = await User.findById(id);
  if (!user) throw new ApiError(404, "User not found.");
  if (String(user._id) === String(req.user._id)) throw new ApiError(400, "You cannot block your own account.");
  assertManageTarget(req.user, user.role);
  assertPermissionForRole(req.user, user.role);
  if (req.user.role === ROLES.SUB_ADMIN && !req.user.permissions.includes(PERMISSIONS.BLOCK_USERS)) throw new ApiError(403, "Required block permission is missing.");
  user.status = blocked ? "BLOCKED" : "ACTIVE";
  user.blockedBy = blocked ? req.user._id : undefined;
  user.blockedAt = blocked ? new Date() : undefined;
  user.blockReason = blocked ? reason : undefined;
  user.refreshTokenHash = undefined;
  await user.save({ validateBeforeSave: false });
  if (blocked) await sendAccountBlockedEmail(user, reason);
  await recordAudit(req, blocked ? "USER_BLOCKED" : "USER_UNBLOCKED", "User", user._id, blocked ? "Blocked user account" : "Unblocked user account");
  return user;
};
export const deleteUser = async (req, id) => {
  if (String(id) === String(req.user._id)) throw new ApiError(400, "You cannot delete your own account.");
  const user = await User.findById(id);
  if (!user) throw new ApiError(404, "User not found.");
  assertManageTarget(req.user, user.role);
  assertPermissionForRole(req.user, user.role);
  user.status = "DELETED";
  user.refreshTokenHash = undefined;
  await user.save({ validateBeforeSave: false });
  await recordAudit(req, "USER_DELETED", "User", user._id, "Soft-deleted user account");
};
export const resetUserPassword = async (req, id, password) => {
  const user = await User.findById(id).select("+password");
  if (!user) throw new ApiError(404, "User not found.");
  assertManageTarget(req.user, user.role);
  assertPermissionForRole(req.user, user.role);
  if (req.user.role === ROLES.SUB_ADMIN && !req.user.permissions.includes(PERMISSIONS.RESET_USER_PASSWORDS)) throw new ApiError(403, "Required reset permission is missing.");
  user.password = password; user.mustChangePassword = true; user.refreshTokenHash = undefined;
  await user.save();
  await recordAudit(req, "PASSWORD_RESET_BY_ADMIN", "User", user._id, "Issued temporary password");
};
