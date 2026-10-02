'use strict';

const { District, GridSubstation, SolarInstallation } = require('../models');

/**
 * Middleware factory for Jurisdictional RBAC on read paths.
 * Enforces security rules for 'national', 'provincial', and 'district' roles.
 *
 * @param {'province' | 'district' | 'substation' | 'installation'} resourceType
 * @returns {import('express').RequestHandler}
 */
function authorizeJurisdiction(resourceType) {
  return async (req, res, next) => {
    try {
      const auth = req.auth;

      if (!auth) {
        return res.status(401).json({
          code: 'UNAUTHORIZED',
          message: 'Authentication credentials are required.',
          detail: 'Authentication required for jurisdictional resource access.',
          timestamp: new Date().toISOString(),
        });
      }

      const role = auth.role;
      const jurisdictionId = auth.jurisdiction_id;
      const userScopes = Array.isArray(auth.scopes)
        ? auth.scopes
        : typeof auth.scope === 'string'
        ? auth.scope.split(' ')
        : [];

      // 1. National Scope: Full unrestricted read access
      if (role === 'national' || userScopes.includes('read:national')) {
        return next();
      }

      const targetId = req.params.id;

      // Handle root collection read: GET /provinces
      if (!targetId && resourceType === 'province') {
        return next();
      }

      // 2. Provincial Scope: Restricted to entities within their assigned province_id
      if (role === 'provincial') {
        if (!jurisdictionId) {
          return res.status(403).json({
            code: 'FORBIDDEN',
            message: 'Access denied: Insufficient jurisdictional scope.',
            detail: 'Provincial user has no assigned province_id in claims.',
            timestamp: new Date().toISOString(),
          });
        }

        // Validate province scope claim
        const expectedScope = `read:province:${jurisdictionId}`;
        if (!userScopes.includes(expectedScope) && !userScopes.includes('read:national')) {
          return res.status(403).json({
            code: 'FORBIDDEN',
            message: 'Access denied: Insufficient jurisdictional scope.',
            detail: `Missing required scope claim '${expectedScope}'.`,
            timestamp: new Date().toISOString(),
          });
        }

        if (resourceType === 'province') {
          if (targetId !== jurisdictionId) {
            return res.status(403).json({
              code: 'FORBIDDEN',
              message: 'Access denied: Provincial boundary restriction.',
              detail: `User is restricted to province '${jurisdictionId}'.`,
              timestamp: new Date().toISOString(),
            });
          }
          return next();
        }

        if (resourceType === 'district') {
          const district = await District.findByPk(targetId, { attributes: ['id', 'province_id'] });
          if (!district) {
            return res.status(404).json({
              code: 'NOT_FOUND',
              message: 'District not found.',
              detail: `District with id '${targetId}' was not found.`,
              timestamp: new Date().toISOString(),
            });
          }
          if (district.province_id !== jurisdictionId) {
            return res.status(403).json({
              code: 'FORBIDDEN',
              message: 'Access denied: Provincial boundary restriction.',
              detail: `District does not belong to authorized province '${jurisdictionId}'.`,
              timestamp: new Date().toISOString(),
            });
          }
          return next();
        }

        if (resourceType === 'substation') {
          const substation = await GridSubstation.findByPk(targetId, {
            attributes: ['id', 'district_id'],
            include: [{ model: District, as: 'district', attributes: ['id', 'province_id'] }],
          });
          if (!substation) {
            return res.status(404).json({
              code: 'NOT_FOUND',
              message: 'GridSubstation not found.',
              detail: `GridSubstation with id '${targetId}' was not found.`,
              timestamp: new Date().toISOString(),
            });
          }
          if (substation.district?.province_id !== jurisdictionId) {
            return res.status(403).json({
              code: 'FORBIDDEN',
              message: 'Access denied: Provincial boundary restriction.',
              detail: `Substation does not belong to authorized province '${jurisdictionId}'.`,
              timestamp: new Date().toISOString(),
            });
          }
          return next();
        }

        if (resourceType === 'installation') {
          const installation = await SolarInstallation.findByPk(targetId, {
            attributes: ['id', 'grid_substation_id'],
            include: [
              {
                model: GridSubstation,
                as: 'grid_substation',
                attributes: ['id', 'district_id'],
                include: [{ model: District, as: 'district', attributes: ['id', 'province_id'] }],
              },
            ],
          });
          if (!installation) {
            return res.status(404).json({
              code: 'NOT_FOUND',
              message: 'SolarInstallation not found.',
              detail: `SolarInstallation with id '${targetId}' was not found.`,
              timestamp: new Date().toISOString(),
            });
          }
          if (installation.grid_substation?.district?.province_id !== jurisdictionId) {
            return res.status(403).json({
              code: 'FORBIDDEN',
              message: 'Access denied: Provincial boundary restriction.',
              detail: `Installation does not belong to authorized province '${jurisdictionId}'.`,
              timestamp: new Date().toISOString(),
            });
          }
          return next();
        }
      }

      // 3. District Scope: Strictly restricted to their assigned district_id
      if (role === 'district') {
        if (!jurisdictionId) {
          return res.status(403).json({
            code: 'FORBIDDEN',
            message: 'Access denied: Insufficient jurisdictional scope.',
            detail: 'District user has no assigned district_id in claims.',
            timestamp: new Date().toISOString(),
          });
        }

        // Validate district scope claim
        const expectedScope = `read:district:${jurisdictionId}`;
        if (!userScopes.includes(expectedScope) && !userScopes.includes('read:national')) {
          return res.status(403).json({
            code: 'FORBIDDEN',
            message: 'Access denied: Insufficient jurisdictional scope.',
            detail: `Missing required scope claim '${expectedScope}'.`,
            timestamp: new Date().toISOString(),
          });
        }

        if (resourceType === 'province') {
          return res.status(403).json({
            code: 'FORBIDDEN',
            message: 'Access denied: District boundary restriction.',
            detail: 'District user cannot access province-level collections.',
            timestamp: new Date().toISOString(),
          });
        }

        if (resourceType === 'district') {
          if (targetId !== jurisdictionId) {
            return res.status(403).json({
              code: 'FORBIDDEN',
              message: 'Access denied: District boundary restriction.',
              detail: `User is restricted to district '${jurisdictionId}'.`,
              timestamp: new Date().toISOString(),
            });
          }
          return next();
        }

        if (resourceType === 'substation') {
          const substation = await GridSubstation.findByPk(targetId, { attributes: ['id', 'district_id'] });
          if (!substation) {
            return res.status(404).json({
              code: 'NOT_FOUND',
              message: 'GridSubstation not found.',
              detail: `GridSubstation with id '${targetId}' was not found.`,
              timestamp: new Date().toISOString(),
            });
          }
          if (substation.district_id !== jurisdictionId) {
            return res.status(403).json({
              code: 'FORBIDDEN',
              message: 'Access denied: District boundary restriction.',
              detail: `Substation is outside authorized district '${jurisdictionId}'.`,
              timestamp: new Date().toISOString(),
            });
          }
          return next();
        }

        if (resourceType === 'installation') {
          const installation = await SolarInstallation.findByPk(targetId, {
            attributes: ['id', 'grid_substation_id'],
            include: [{ model: GridSubstation, as: 'grid_substation', attributes: ['id', 'district_id'] }],
          });
          if (!installation) {
            return res.status(404).json({
              code: 'NOT_FOUND',
              message: 'SolarInstallation not found.',
              detail: `SolarInstallation with id '${targetId}' was not found.`,
              timestamp: new Date().toISOString(),
            });
          }
          if (installation.grid_substation?.district_id !== jurisdictionId) {
            return res.status(403).json({
              code: 'FORBIDDEN',
              message: 'Access denied: District boundary restriction.',
              detail: `Installation is outside authorized district '${jurisdictionId}'.`,
              timestamp: new Date().toISOString(),
            });
          }
          return next();
        }
      }

      // If role is unrecognized or unsupported
      return res.status(403).json({
        code: 'FORBIDDEN',
        message: 'Access denied: Unauthorized role.',
        detail: `Role '${role}' is not authorized for this resource.`,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };
}

module.exports = authorizeJurisdiction;
