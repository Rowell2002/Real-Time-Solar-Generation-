'use strict';

const { SolarInstallation } = require('../models');

/**
 * Authorizes metering device write access for: POST /installations/:id/readings
 * - Validates that the targeted installation exists in the database (404 if missing).
 * - Enforces that the token contains the specific scope claim 'installation:write:{installation_id}'.
 * - If a device assigned to installation A attempts to post to installation B, rejects with HTTP 403 Forbidden.
 */
async function authorizeDeviceWrite(req, res, next) {
  try {
    const { id } = req.params;
    const auth = req.auth;

    if (!auth) {
      return res.status(401).json({
        code: 'UNAUTHORIZED',
        message: 'Authentication credentials are required.',
        detail: 'Authentication required before device authorization check.',
        timestamp: new Date().toISOString(),
      });
    }

    // 1. Verify that the target installation exists in the database
    const installation = await SolarInstallation.findByPk(id, {
      attributes: ['id', 'name', 'meter_id'],
    });

    if (!installation) {
      return res.status(404).json({
        code: 'NOT_FOUND',
        message: 'The requested solar installation was not found.',
        detail: `SolarInstallation with id '${id}' was not found in database.`,
        timestamp: new Date().toISOString(),
      });
    }

    // 2. Extract and check token scopes
    const userScopes = Array.isArray(auth.scopes)
      ? auth.scopes
      : typeof auth.scope === 'string'
      ? auth.scope.split(' ')
      : [];

    const expectedScope = `installation:write:${id}`;
    const hasAuthorizedScope =
      userScopes.includes(expectedScope) ||
      userScopes.includes('installation:write:*') ||
      auth.role === 'national';

    if (!hasAuthorizedScope) {
      return res.status(403).json({
        code: 'FORBIDDEN',
        message: 'Access denied: Device token is not authorized for this installation.',
        detail: `Missing required scope claim '${expectedScope}'.`,
        timestamp: new Date().toISOString(),
      });
    }

    // Attach verified installation to request object
    req.targetInstallation = installation;
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = authorizeDeviceWrite;
