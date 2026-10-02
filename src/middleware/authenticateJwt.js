'use strict';

const { verifyToken } = require('../utils/jwtUtils');

/**
 * Extracts and verifies the JWT Bearer token from the Authorization header.
 * Attaches decoded payload to req.auth.
 * Rejects unauthenticated requests with standardized 401 JSON contract.
 */
function authenticateJwt(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    return res.status(401).json({
      code: 'UNAUTHORIZED',
      message: 'Authentication credentials are required.',
      detail: "Missing Authorization header. Expected format: 'Authorization: Bearer <token>'.",
      timestamp: new Date().toISOString(),
    });
  }

  const parts = authHeader.trim().split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return res.status(401).json({
      code: 'UNAUTHORIZED',
      message: 'Authentication credentials are required.',
      detail: "Malformed Authorization header. Format must be 'Bearer <token>'.",
      timestamp: new Date().toISOString(),
    });
  }

  const token = parts[1];

  try {
    const decoded = verifyToken(token);
    req.auth = decoded;
    req.user = decoded; // alias for convenience
    next();
  } catch (error) {
    return res.status(401).json({
      code: 'UNAUTHORIZED',
      message: 'Authentication credentials are invalid.',
      detail: error.name === 'TokenExpiredError' ? 'JWT token has expired.' : 'Invalid JWT token signature or claims.',
      timestamp: new Date().toISOString(),
    });
  }
}

module.exports = authenticateJwt;
