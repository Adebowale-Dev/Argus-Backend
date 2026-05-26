export const paginationParams = (query) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 100);
  return { page, limit, skip: (page - 1) * limit, sort: query.sort || "-createdAt" };
};

export const paginationMeta = (page, limit, total) => ({ page, limit, total, totalPages: Math.ceil(total / limit) });
