'use strict';

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'slsea-super-secure-production-jwt-secret-key-2026';
const JWT_ISSUER = 'slsea.gov.lk';
const JWT_AUDIENCE = 'slsea-solar-api';

/**
 * Signs a payload into a JWT Bearer token.
 * @param {Object} payload
 * @param {Object} options
 * @returns {string} Signed JWT token string
 */
function signToken(payload, options = {}) {
  const signOptions = {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    expiresIn: options.expiresIn || '24h',
    ...options,
  };
  return jwt.sign(payload, JWT_SECRET, signOptions);
}

/**
 * Synchronously verifies a JWT token.
 * @param {string} token
 * @returns {Object} Decoded payload
 */
function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

/**
 * Generates an authorized device write token for a specific solar installation.
 * Scope: 'installation:write:{installation_id}'
 * @param {string} installationId
 * @param {Object} options
 * @returns {string}
 */
function generateDeviceToken(installationId, options = {}) {
  const scope = `installation:write:${installationId}`;
  return signToken(
    {
      sub: `device:${installationId}`,
      type: 'device',
      installation_id: installationId,
      scope,
      scopes: [scope],
    },
    options
  );
}

/**
 * Generates an authorized user token for an SLSEA analyst/official.
 * Roles: 'national' | 'provincial' | 'district'
 * Scopes: 'read:national' | 'read:province:{id}' | 'read:district:{id}'
 * @param {Object} user - { id, email, role, jurisdiction_id }
 * @param {Object} options
 * @returns {string}
 */
function generateUserToken(user, options = {}) {
  let scope = 'read:national';
  if (user.role === 'provincial') {
    scope = `read:province:${user.jurisdiction_id}`;
  } else if (user.role === 'district') {
    scope = `read:district:${user.jurisdiction_id}`;
  }

  return signToken(
    {
      sub: user.id,
      email: user.email,
      type: 'user',
      role: user.role,
      jurisdiction_id: user.jurisdiction_id || null,
      scope,
      scopes: [scope],
    },
    options
  );
}

module.exports = {
  JWT_SECRET,
  JWT_ISSUER,
  JWT_AUDIENCE,
  signToken,
  verifyToken,
  generateDeviceToken,
  generateUserToken,
};
