export const EXAM_ACCESS_TYPES = ["PUBLIC_LINK_WITH_CODE", "LOGIN_REQUIRED_WITH_CODE", "INVITE_ONLY"];
export const EXAM_AVAILABILITY_MODES = ["ALWAYS_OPEN", "SCHEDULED", "CLOSED_MANUALLY"];

export const DEFAULT_CANDIDATE_IDENTITY_REQUIREMENTS = Object.freeze({
  fullName: true,
  email: true,
  phone: false,
  identifier: false,
});
