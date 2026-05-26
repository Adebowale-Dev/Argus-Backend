import { Router } from "express";
import * as controller from "./questionBank.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { authorizeRoles } from "../../middlewares/role.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { ROLES } from "../../constants/roles.js";
import { questionBankSchema, questionBankUpdateSchema } from "./questionBank.validation.js";

const router = Router();
router.use(authenticate);
router.get("/", authorizeRoles(ROLES.SUPER_ADMIN, ROLES.SUB_ADMIN, ROLES.EXAMINER), controller.list);
router.post("/", authorizeRoles(ROLES.EXAMINER), validate({ body: questionBankSchema }), controller.create);
router.get("/:id", authorizeRoles(ROLES.SUPER_ADMIN, ROLES.SUB_ADMIN, ROLES.EXAMINER), controller.get);
router.patch("/:id", authorizeRoles(ROLES.EXAMINER), validate({ body: questionBankUpdateSchema }), controller.update);
router.delete("/:id", authorizeRoles(ROLES.EXAMINER), controller.remove);
router.get("/:id/questions", authorizeRoles(ROLES.SUPER_ADMIN, ROLES.SUB_ADMIN, ROLES.EXAMINER), controller.questions);

export default router;
