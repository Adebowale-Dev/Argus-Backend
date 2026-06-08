import { env } from "../config/env.js";
import { brevoClient, sender } from "../config/brevo.js";
import { logger } from "../middlewares/requestLogger.middleware.js";
import { renderEmail } from "./email.renderer.js";

const send = async (to, subject, template, variables) => {
  const htmlContent = await renderEmail(template, variables);
  if (!env.SEND_EMAILS) {
    logger.info({ to, subject, template }, "Email suppressed because SEND_EMAILS=false");
    return;
  }
  try {
    await brevoClient.sendTransacEmail({ sender, to: [{ email: to }], subject, htmlContent });
  } catch (error) {
    logger.error({ error, to, subject }, "Notification email failed");
  }
};

const formatDateTime = (value) => value
  ? new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
  : "Not scheduled yet";

const buildExamEmailPayload = (user, exam, extra = {}) => {
  const accessModeLabel = ["LOGIN_REQUIRED_WITH_CODE", "INVITE_ONLY"].includes(exam.accessType)
    ? "Verified private exam"
    : "Public exam";
  const accessInstructions = ["LOGIN_REQUIRED_WITH_CODE", "INVITE_ONLY"].includes(exam.accessType)
    ? "Open the exam link, enter the shared AR exam code, then verify this same email address with the one-time code we send before starting."
    : "Open the exam link, enter the shared AR exam code, complete the required candidate details, and begin your exam.";

  return {
    ...user.toObject?.() ?? user,
    examTitle: exam.title,
    examCode: exam.code ?? "",
    examLink: exam.publicUrl ?? "",
    accessModeLabel,
    accessInstructions,
    startTimeText: formatDateTime(exam.startTime),
    endTimeText: formatDateTime(exam.endTime),
    durationMinutes: exam.durationMinutes ?? "",
    instructions: exam.instructions ?? "",
    ...extra,
  };
};

export const sendWelcomeEmail = (user) => send(user.email, `Welcome to ${env.APP_NAME}`, "welcome", user);
export const sendAdminCreatedEmail = (user, temporaryPassword) => send(user.email, "Your ARGUS administrator account", "admin-created", { ...user.toObject?.() ?? user, temporaryPassword });
export const sendSubAdminCreatedEmail = (user, temporaryPassword) => send(user.email, "Your ARGUS sub-admin account", "sub-admin-created", { ...user.toObject?.() ?? user, temporaryPassword });
export const sendExaminerCreatedEmail = (user, temporaryPassword) => send(user.email, "Your ARGUS examiner account", "examiner-created", { ...user.toObject?.() ?? user, temporaryPassword });
export const sendCandidateCreatedEmail = (user, temporaryPassword) => send(user.email, "Your ARGUS candidate account", "candidate-created", { ...user.toObject?.() ?? user, temporaryPassword });
export const sendPasswordResetEmail = (user, resetUrl) => send(user.email, "Reset your ARGUS password", "password-reset", { ...user.toObject?.() ?? user, resetUrl });
export const sendOtpEmail = (user, otp) => send(user.email, "Your ARGUS verification code", "otp", { ...user.toObject?.() ?? user, otp });
export const sendExamAssignedEmail = (user, exam, extra = {}) => send(user.email, `Exam invitation: ${exam.title}`, "exam-assigned", buildExamEmailPayload(user, exam, extra));
export const sendExamInviteEmail = (candidate, exam, extra = {}) => send(candidate.email, `You have been invited to ${exam.title}`, "exam-assigned", buildExamEmailPayload(candidate, exam, { invitationType: "verified-invite", ...extra }));
export const sendExamStartReminderEmail = (user, exam) => send(user.email, `Reminder: ${exam.title} starts soon`, "exam-start-reminder", { ...user.toObject?.() ?? user, examTitle: exam.title, startTime: exam.startTime });
export const sendExamSubmittedEmail = (user, exam, attempt) => send(user.email, `Submission received: ${exam.title}`, "exam-submitted", { ...user.toObject?.() ?? user, examTitle: exam.title, submittedAt: attempt.submittedAt });
export const sendAutoSubmitAlertEmail = (examiner, candidate, exam, reason) => send(examiner.email, `Auto-submit alert: ${exam.title}`, "auto-submit-alert", { fullName: examiner.fullName, candidateName: candidate.fullName, examTitle: exam.title, reason });
export const sendExamPublishedEmail = (examiner, exam, publicUrl, accessCode) => send(examiner.email, `Exam published: ${exam.title}`, "exam-published", { fullName: examiner.fullName, examTitle: exam.title, publicUrl, accessCode });
export const sendExamLinkGeneratedEmail = (examiner, exam, publicUrl) => send(examiner.email, `New exam link: ${exam.title}`, "exam-link-generated", { fullName: examiner.fullName, examTitle: exam.title, publicUrl });
export const sendExamAccessCodeRegeneratedEmail = (examiner, exam, accessCode) => send(examiner.email, `New access code: ${exam.title}`, "exam-access-code-regenerated", { fullName: examiner.fullName, examTitle: exam.title, accessCode });
export const sendExamStartConfirmationEmail = (candidateProfile, exam) => candidateProfile.email && send(candidateProfile.email, `Exam started: ${exam.title}`, "exam-start-confirmation", { fullName: candidateProfile.fullName, examTitle: exam.title });
export const sendSuspiciousActivityAlertEmail = (examiner, candidateProfile, exam, event) => send(examiner.email, `Suspicious activity: ${exam.title}`, "suspicious-activity-alert", { fullName: examiner.fullName, candidateName: candidateProfile.fullName, examTitle: exam.title, eventType: event.eventType });
export const sendAccountBlockedEmail = (user, reason) => send(user.email, "Your ARGUS account has been blocked", "account-blocked", { ...user.toObject?.() ?? user, reason });
