'use strict';

const crypto = require('crypto');
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');

/**
 * GET /national/summary
 * National operational solar generation dashboard summary for CEB / SLSEA headquarters.
 * Computes island-wide instantaneous power (kW/MW), cumulative energy today (kWh/MWh),
 * total active installation count, and provincial breakdown across all 9 provinces.
 *
 * Enforces single-query performance optimization via CTEs and window functions.
 */
async function getNationalSummary(req, res, next) {
  try {
    const auth = req.auth;

    // Enforce role restriction: only national role or read:national scope
    const userScopes = Array.isArray(auth?.scopes)
      ? auth.scopes
      : typeof auth?.scope === 'string'
      ? auth.scope.split(' ')
      : [];

    const isNational = auth?.role === 'national' || userScopes.includes('read:national');
    if (!isNational) {
      return res.status(403).json({
        code: 'FORBIDDEN',
        message: 'Access denied: National summary is restricted to national role analysts.',
        detail: `Current role '${auth?.role}' is not authorized to access national command aggregates.`,
        timestamp: new Date().toISOString(),
      });
    }

    // Single optimized query using CTEs and ROW_NUMBER() window function
    const nationalQuery = `
      WITH latest_readings AS (
          SELECT 
              r.installation_id,
              r.power_kw,
              r.energy_kwh,
              r.timestamp,
              ROW_NUMBER() OVER (PARTITION BY r.installation_id ORDER BY r.timestamp DESC) AS rn
          FROM generation_readings r
      ),
      today_readings AS (
          SELECT 
              r.installation_id,
              COALESCE(MAX(r.energy_kwh) - MIN(r.energy_kwh), 0) AS energy_today_kwh
          FROM generation_readings r
          WHERE DATE(r.timestamp) = CURRENT_DATE
          GROUP BY r.installation_id
      ),
      province_stats AS (
          SELECT 
              p.id AS province_id,
              p.name AS province_name,
              p.code AS province_code,
              COUNT(DISTINCT si.id) AS active_installations_count,
              COALESCE(SUM(lr.power_kw), 0) AS current_total_power_kw,
              COALESCE(SUM(tr.energy_today_kwh), 0) AS today_energy_kwh
          FROM provinces p
          LEFT JOIN districts d ON d.province_id = p.id
          LEFT JOIN grid_substations gs ON gs.district_id = d.id
          LEFT JOIN solar_installations si ON si.grid_substation_id = gs.id
          LEFT JOIN latest_readings lr ON lr.installation_id = si.id AND lr.rn = 1
          LEFT JOIN today_readings tr ON tr.installation_id = si.id
          GROUP BY p.id, p.name, p.code
      )
      SELECT 
          province_id,
          province_name,
          province_code,
          active_installations_count,
          current_total_power_kw,
          today_energy_kwh
      FROM province_stats
      ORDER BY province_name ASC;
    `;

    const rows = await sequelize.query(nationalQuery, {
      type: QueryTypes.SELECT,
    });

    let totalNationalInstallations = 0;
    let currentNationalPowerKw = 0;
    let todayNationalEnergyKwh = 0;
    const provincesBreakdown = [];

    for (const row of rows) {
      const activeCount = parseInt(row.active_installations_count || 0, 10);
      const powerKw = parseFloat(row.current_total_power_kw || 0);
      const energyKwh = parseFloat(row.today_energy_kwh || 0);

      totalNationalInstallations += activeCount;
      currentNationalPowerKw += powerKw;
      todayNationalEnergyKwh += energyKwh;

      provincesBreakdown.push({
        province_id: row.province_id,
        province_name: row.province_name,
        province_code: row.province_code,
        active_installations_count: activeCount,
        current_total_power_kw: Math.round(powerKw * 1000) / 1000,
        current_total_power_mw: Math.round((powerKw / 1000) * 1000) / 1000,
        today_total_energy_kwh: Math.round(energyKwh * 100) / 100,
      });
    }

    const payload = {
      country: 'Sri Lanka',
      total_provinces: provincesBreakdown.length,
      total_active_installations: totalNationalInstallations,
      current_total_power_kw: Math.round(currentNationalPowerKw * 1000) / 1000,
      current_total_power_mw: Math.round((currentNationalPowerKw / 1000) * 1000) / 1000,
      today_total_energy_kwh: Math.round(todayNationalEnergyKwh * 1000) / 1000,
      today_total_energy_mwh: Math.round((todayNationalEnergyKwh / 1000) * 1000) / 1000,
      provinces_breakdown: provincesBreakdown,
    };

    // Calculate SHA-256 ETag for caching
    const hash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const etag = `"${hash}"`;

    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'public, max-age=30, must-revalidate');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    // Conditional GET evaluation (If-None-Match)
    const ifNoneMatch = req.headers['if-none-match'];
    if (ifNoneMatch && (ifNoneMatch === etag || ifNoneMatch === `W/${etag}` || `W/${ifNoneMatch}` === etag || ifNoneMatch === '*')) {
      return res.status(304).end();
    }

    return res.status(200).json(payload);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getNationalSummary,
};
