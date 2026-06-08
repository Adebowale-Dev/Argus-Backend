import { Router } from "express";
import * as controller from "./publicExam.controller.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { publicExamLimiter } from "../../middlewares/rateLimit.middleware.js";
import { resolveExamCodeSchema, requestEmailOtpSchema, startPublicExamSchema, verifyCodeSchema, verifyEmailOtpSchema } from "./publicExam.validation.js";

const router = Router();
router.post("/resolve-code", publicExamLimiter, validate({ body: resolveExamCodeSchema }), controller.resolveExamCode);
router.get("/:slug", publicExamLimiter, controller.landing);
router.post("/:slug/verify-code", publicExamLimiter, validate({ body: verifyCodeSchema }), controller.verifyCode);
router.post("/:slug/request-email-otp", publicExamLimiter, validate({ body: requestEmailOtpSchema }), controller.requestEmailOtp);
router.post("/:slug/verify-email-otp", publicExamLimiter, validate({ body: verifyEmailOtpSchema }), controller.verifyEmailOtp);
router.post("/:slug/start", publicExamLimiter, validate({ body: startPublicExamSchema }), controller.start);

export default router;
