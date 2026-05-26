export const sanitizeMongoKeys = (req, _res, next) => {
  const clean = (value) => {
    if (Array.isArray(value)) return value.map(clean);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).filter(([key]) => !key.startsWith("$") && !key.includes(".")).map(([key, item]) => [key, clean(item)]));
    }
    return value;
  };
  req.body = clean(req.body);
  next();
};
