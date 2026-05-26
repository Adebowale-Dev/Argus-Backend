import { ApiError } from "../utils/ApiError.js";

export const validate = (schemas) => (req, _res, next) => {
  for (const [target, schema] of Object.entries(schemas)) {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      return next(new ApiError(400, "Request validation failed.", result.error.issues.map((issue) => ({
        field: issue.path.join("."), message: issue.message
      }))));
    }
    req[target] = result.data;
  }
  next();
};
