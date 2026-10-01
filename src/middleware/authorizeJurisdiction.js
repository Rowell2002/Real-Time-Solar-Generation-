'use strict';

const { Province, District, GridSubstation, SolarInstallation } = require('../models');

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
          error: 'Unauthorized',
          message: 'Authentication required for jurisdictional resource access.',
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
        // Provincial users can list provinces or access root, but downstream scoped queries filter by province
        return next();
      }

      // 2. Provincial Scope: Restricted to entities within their assigned province_id
      if (role === 'provincial') {
        if (!jurisdictionId) {
          return res.status(403).json({
            error: 'Forbidden',
            message: 'Access denied: Provincial user has no assigned province_id.',
          });
        }

        // Validate province scope claim
        const expectedScope = `read:province:${jurisdictionId}`;
        if (!userScopes.includes(expectedScope) && !userScopes.includes('read:national')) {
          return res.status(403).json({
            error: 'Forbidden',
            message: `Access denied: Missing required scope claim '${expectedScope}'.`,
          });
        }

        if (resourceType === 'province') {
          if (targetId !== jurisdictionId) {
            return res.status(403).json({
              error: 'Forbidden',
              message: `Access denied: User is restricted to province '${jurisdictionId}'.`,
            });
          }
          return next();
        }

        if (resourceType === 'district') {
          const district = await District.findByPk(targetId, { attributes: ['id', 'province_id'] });
          if (!district) {
            return res.status(404).json({ error: 'Not Found', message: `District with id '${targetId}' was not found.` });
          }
          if (district.province_id !== jurisdictionId) {
            return res.status(403).json({
              error: 'Forbidden',
              message: `Access denied: District does not belong to authorized province '${jurisdictionId}'.`,
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
            return res.status(404).json({ error: 'Not Found', message: `GridSubstation with id '${targetId}' was not found.` });
          }
          if (substation.district?.province_id !== jurisdictionId) {
            return res.status(403).json({
              error: 'Forbidden',
              message: `Access denied: Substation does not belong to authorized province '${jurisdictionId}'.`,
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
            return res.status(404).json({ error: 'Not Found', message: `SolarInstallation with id '${targetId}' was not found.` });
          }
          if (installation.grid_substation?.district?.province_id !== jurisdictionId) {
            return res.status(403).json({
              error: 'Forbidden',
              message: `Access denied: Installation does not belong to authorized province '${jurisdictionId}'.`,
            });
          }
          return next();
        }
      }

      // 3. District Scope: Strictly restricted to their assigned district_id
      if (role === 'district') {
        if (!jurisdictionId) {
          return res.status(403).json({
            error: 'Forbidden',
            message: 'Access denied: District user has no assigned district_id.',
          });
        }

        // Validate district scope claim
        const expectedScope = `read:district:${jurisdictionId}`;
        if (!userScopes.includes(expectedScope) && !userScopes.includes('read:national')) {
          return res.status(403).json({
            error: 'Forbidden',
            message: `Access denied: Missing required scope claim '${expectedScope}'.`,
          });
        }

        if (resourceType === 'province') {
          return res.status(403).json({
            error: 'Forbidden',
            message: `Access denied: District user cannot access province-level collections.`,
          });
        }

        if (resourceType === 'district') {
          if (targetId !== jurisdictionId) {
            return res.status(403).json({
              error: 'Forbidden',
              message: `Access denied: User is restricted to district '${jurisdictionId}'.`,
            });
          }
          return next();
        }

        if (resourceType === 'substation') {
          const substation = await GridSubstation.findByPk(targetId, { attributes: ['id', 'district_id'] });
          if (!substation) {
            return res.status(404).json({ error: 'Not Found', message: `GridSubstation with id '${targetId}' was not found.` });
          }
          if (substation.district_id !== jurisdictionId) {
            return res.status(403).json({
              error: 'Forbidden',
              message: `Access denied: Substation is outside authorized district '${jurisdictionId}'.`,
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
            return res.status(404).json({ error: 'Not Found', message: `SolarInstallation with id '${targetId}' was not found.` });
          }
          if (installation.grid_substation?.district_id !== jurisdictionId) {
            return res.status(403).json({
              error: 'Forbidden',
              message: `Access denied: Installation is outside authorized district '${jurisdictionId}'.`,
            });
          }
          return next();
        }
      }

      // If role is unrecognized or unsupported
      return res.status(403).json({
        error: 'Forbidden',
        message: `Access denied: Role '${role}' is not authorized for this resource.`,
      });
    } catch (error) {
      next(error);
    }
  };
}

module.exports = authorizeJurisdiction;
