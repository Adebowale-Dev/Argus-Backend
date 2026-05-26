import { Router } from "express";
import * as controller from "./auth.controller.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { loginLimiter } from "../../middlewares/rateLimit.middleware.js";
import { loginSchema, registerExaminerSchema, forgotPasswordSchema, resetPasswordSchema, changePasswordSchema } from "./auth.validation.js";

const router = Router();
router.post("/register-examiner", validate({ body: registerExaminerSchema }), controller.registerExaminer);
router.post("/login", loginLimiter, validate({ body: loginSchema }), controller.login);
router.post("/refresh-token", controller.refresh);
router.post("/forgot-password", validate({ body: forgotPasswordSchema }), controller.forgotPassword);
router.post("/reset-password", validate({ body: resetPasswordSchema }), controller.resetPassword);
router.use(authenticate);
router.get("/me", controller.me);
router.post("/logout", controller.logout);
router.post("/change-password", validate({ body: changePasswordSchema }), controller.changePassword);
export default router;
