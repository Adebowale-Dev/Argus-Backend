import { Router } from "express";
import * as controller from "./dashboard.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { authorizeRoles } from "../../middlewares/role.middleware.js";
import { ROLES } from "../../constants/roles.js";

const router = Router();
router.use(authenticate);
router.get("/admin", authorizeRoles(ROLES.SUPER_ADMIN, ROLES.SUB_ADMIN), controller.admin);
router.get("/examiner", authorizeRoles(ROLES.EXAMINER), controller.examiner);
router.get("/candidate", authorizeRoles(ROLES.CANDIDATE), controller.candidate);

export default router;
