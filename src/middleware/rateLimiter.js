'use strict';

/**
 * High-performance, in-memory sliding window rate limiter middleware.
 * Enforces API quota protection without external dependencies.
 * Produces standardized JSON error contract on quota exhaustion (HTTP 429).
 *
 * @param {Object} options
 * @param {number} [options.windowMs=60000] - Window duration in milliseconds (default 1 minute)
 * @param {number} [options.max=120] - Maximum allowed requests per window
 * @param {Function} [options.keyGenerator] - Custom key extraction function
 * @returns {import('express').RequestHandler}
 */
function createRateLimiter(options = {}) {
  const windowMs = options.windowMs || 60 * 1000;
  const max = options.max || 120;
  const keyGenerator =
    options.keyGenerator ||
    ((req) => req.auth?.sub || req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'anonymous');

  // Map of clientKey -> { timestamps: number[] }
  const clients = new Map();

  // Periodic garbage collection every 2 minutes
  const gcInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of clients.entries()) {
      record.timestamps = record.timestamps.filter((ts) => now - ts < windowMs);
      if (record.timestamps.length === 0) {
        clients.delete(key);
      }
    }
  }, Math.max(windowMs, 60000));

  // Allow Node to exit without waiting on GC timer
  if (gcInterval.unref) {
    gcInterval.unref();
  }

  return (req, res, next) => {
    // In test environment, allow bypassing with test header if explicitly disabled
    if (process.env.NODE_ENV === 'test' && req.headers['x-skip-rate-limit'] === 'true') {
      return next();
    }

    const key = keyGenerator(req);
    const now = Date.now();

    let record = clients.get(key);
    if (!record) {
      record = { timestamps: [] };
      clients.set(key, record);
    }

    // Filter out timestamps outside the sliding window
    record.timestamps = record.timestamps.filter((ts) => now - ts < windowMs);

    const currentCount = record.timestamps.length;
    const remaining = Math.max(0, max - currentCount - 1);
    const oldestTimestamp = record.timestamps[0] || now;
    const resetTimeSeconds = Math.ceil((oldestTimestamp + windowMs - now) / 1000);

    // Set RFC 6585 rate limiting headers
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', Math.max(0, resetTimeSeconds));

    if (currentCount >= max) {
      res.setHeader('Retry-After', Math.max(1, resetTimeSeconds));
      return res.status(429).json({
        code: 'TOO_MANY_REQUESTS',
        message: 'Too Many Requests: Rate limit quota exceeded.',
        detail: `Exceeded quota of ${max} requests per ${windowMs / 1000}s. Please retry in ${Math.max(1, resetTimeSeconds)} seconds.`,
        timestamp: new Date().toISOString(),
      });
    }

    record.timestamps.push(now);
    next();
  };
}

module.exports = {
  createRateLimiter,
  apiLimiter: createRateLimiter({ windowMs: 60 * 1000, max: 200 }),
  ingestLimiter: createRateLimiter({ windowMs: 60 * 1000, max: 300 }),
};
