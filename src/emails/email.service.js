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

export const sendWelcomeEmail = (user) => send(user.email, `Welcome to ${env.APP_NAME}`, "welcome", user);
export const sendAdminCreatedEmail = (user, temporaryPassword) => send(user.email, "Your ARGUS administrator account", "admin-created", { ...user.toObject?.() ?? user, temporaryPassword });
export const sendSubAdminCreatedEmail = (user, temporaryPassword) => send(user.email, "Your ARGUS sub-admin account", "sub-admin-created", { ...user.toObject?.() ?? user, temporaryPassword });
export const sendExaminerCreatedEmail = (user, temporaryPassword) => send(user.email, "Your ARGUS examiner account", "examiner-created", { ...user.toObject?.() ?? user, temporaryPassword });
export const sendCandidateCreatedEmail = (user, temporaryPassword) => send(user.email, "Your ARGUS candidate account", "candidate-created", { ...user.toObject?.() ?? user, temporaryPassword });
export const sendPasswordResetEmail = (user, resetUrl) => send(user.email, "Reset your ARGUS password", "password-reset", { ...user.toObject?.() ?? user, resetUrl });
export const sendOtpEmail = (user, otp) => send(user.email, "Your ARGUS verification code", "otp", { ...user.toObject?.() ?? user, otp });
export const sendExamAssignedEmail = (user, exam) => send(user.email, `Exam assigned: ${exam.title}`, "exam-assigned", { ...user.toObject?.() ?? user, examTitle: exam.title, startTime: exam.startTime });
export const sendExamStartReminderEmail = (user, exam) => send(user.email, `Reminder: ${exam.title} starts soon`, "exam-start-reminder", { ...user.toObject?.() ?? user, examTitle: exam.title, startTime: exam.startTime });
export const sendExamSubmittedEmail = (user, exam, attempt) => send(user.email, `Submission received: ${exam.title}`, "exam-submitted", { ...user.toObject?.() ?? user, examTitle: exam.title, submittedAt: attempt.submittedAt });
export const sendAutoSubmitAlertEmail = (examiner, candidate, exam, reason) => send(examiner.email, `Auto-submit alert: ${exam.title}`, "auto-submit-alert", { fullName: examiner.fullName, candidateName: candidate.fullName, examTitle: exam.title, reason });
export const sendAccountBlockedEmail = (user, reason) => send(user.email, "Your ARGUS account has been blocked", "account-blocked", { ...user.toObject?.() ?? user, reason });
