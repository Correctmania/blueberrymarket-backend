// Wrap async route handlers — catches thrown errors automatically
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// Global error handler (mount last in app)
function errorHandler(err, req, res, next) {
  console.error(`[ERROR] ${req.method} ${req.path}`, err.message);
  const status  = err.status || err.statusCode || 500;
  const message = status < 500 ? err.message : 'Internal server error';
  res.status(status).json({ error: message });
}

// 404 handler
function notFound(req, res) {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
}

module.exports = { asyncHandler, errorHandler, notFound };
