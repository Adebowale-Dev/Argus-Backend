import { Router } from "express";
import * as controller from "./question.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { authorizeRoles } from "../../middlewares/role.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { upload } from "../../middlewares/upload.middleware.js";
import { ROLES } from "../../constants/roles.js";
import { PERMISSIONS } from "../../constants/permissions.js";
import { questionSchema, questionUpdateSchema } from "./question.validation.js";
const router = Router();
router.use(authenticate, authorizeRoles(ROLES.SUPER_ADMIN, ROLES.SUB_ADMIN, ROLES.EXAMINER));
router.use((req, _res, next) => {
  if (req.user.role === ROLES.SUB_ADMIN && !req.user.permissions.includes(PERMISSIONS.VIEW_REPORTS)) {
    const error = new Error("Required permission is missing.");
    error.statusCode = 403;
    return next(error);
  }
  next();
});
router.get("/", controller.list);
router.get("/:id", controller.get);
router.post("/", authorizeRoles(ROLES.EXAMINER), validate({ body: questionSchema }), controller.create);
router.post("/bulk-import", authorizeRoles(ROLES.EXAMINER), upload.single("file"), controller.bulkImport);
router.patch("/:id", authorizeRoles(ROLES.EXAMINER), validate({ body: questionUpdateSchema }), controller.update);
router.delete("/:id", authorizeRoles(ROLES.EXAMINER), controller.remove);
router.post("/:id/attachments", authorizeRoles(ROLES.EXAMINER), upload.single("file"), controller.attachment);
export default router;
