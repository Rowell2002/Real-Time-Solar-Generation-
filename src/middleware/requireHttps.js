'use strict';

/**
 * Enforces HTTPS transmission and injects security headers.
 * In production, rejects unencrypted HTTP requests with 403 Forbidden.
 */
function requireHttps(req, res, next) {
  // Always inject HSTS header
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  const isProduction = process.env.NODE_ENV === 'production';
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';

  if (isProduction && !isHttps) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'HTTPS is required for all API communications. Unencrypted HTTP requests are strictly forbidden.',
    });
  }

  next();
}

module.exports = requireHttps;
