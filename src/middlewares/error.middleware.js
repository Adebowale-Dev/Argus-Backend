export const notFound = (req, _res, next) => {
  const error = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

export const errorHandler = (error, _req, res, _next) => {
  const duplicate = error.code === 11000;
  const statusCode = error.statusCode || (duplicate ? 409 : error.name === "CastError" ? 400 : 500);
  if (statusCode >= 500) console.error(error);
  res.status(statusCode).json({
    success: false,
    message: duplicate ? "A record with that unique value already exists." : statusCode >= 500 ? "An unexpected server error occurred." : error.message,
    errors: error.errors || []
  });
};
