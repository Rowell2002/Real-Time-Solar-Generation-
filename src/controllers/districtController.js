'use strict';

const crypto = require('crypto');
const { QueryTypes } = require('sequelize');
const { District, GridSubstation, Province, sequelize } = require('../models');

/**
 * GET /districts/:id/substations
 * Scoped collection: Retrieve all CEB/LECO grid substations sited within a district.
 */
async function getDistrictSubstations(req, res, next) {
  try {
    const { id } = req.params;

    const district = await District.findByPk(id, {
      attributes: ['id', 'name', 'province_id'],
      include: [
        {
          model: Province,
          as: 'province',
          attributes: ['id', 'name', 'code'],
        },
        {
          model: GridSubstation,
          as: 'grid_substations',
          attributes: ['id', 'name', 'capacity_mw', 'district_id', 'createdAt', 'updatedAt'],
        },
      ],
      order: [[{ model: GridSubstation, as: 'grid_substations' }, 'name', 'ASC']],
    });

    if (!district) {
      return res.status(404).json({
        error: 'Not Found',
        message: `District with id '${id}' was not found.`,
      });
    }

    return res.status(200).json({
      district: {
        id: district.id,
        name: district.name,
        province: district.province,
      },
      count: district.grid_substations.length,
      data: district.grid_substations,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /districts/:id/summary
 * Upper-band aggregate processing resource for operational dashboards.
 * Optimized for MySQL 8.0+ / MariaDB 10.5+ / PostgreSQL:
 * Uses a single query with CTEs and ROW_NUMBER() window function to prevent N+1 query overhead.
 */
async function getDistrictSummary(req, res, next) {
  try {
    const { id } = req.params;

    // Single optimized query using CTEs and ROW_NUMBER() OVER (PARTITION BY ... ORDER BY ...)
    const summaryQuery = `
      WITH latest_readings AS (
          SELECT 
              r.installation_id,
              r.power_kw,
              r.energy_kwh,
              r.timestamp,
              ROW_NUMBER() OVER (PARTITION BY r.installation_id ORDER BY r.timestamp DESC) AS rn
          FROM generation_readings r
          INNER JOIN solar_installations si ON r.installation_id = si.id
          INNER JOIN grid_substations gs ON si.grid_substation_id = gs.id
          WHERE gs.district_id = :districtId
      ),
      today_readings AS (
          SELECT 
              r.installation_id,
              COALESCE(MAX(r.energy_kwh) - MIN(r.energy_kwh), 0) AS energy_today_kwh
          FROM generation_readings r
          INNER JOIN solar_installations si ON r.installation_id = si.id
          INNER JOIN grid_substations gs ON si.grid_substation_id = gs.id
          WHERE gs.district_id = :districtId
            AND DATE(r.timestamp) = CURRENT_DATE
          GROUP BY r.installation_id
      ),
      substation_stats AS (
          SELECT 
              gs.id AS substation_id,
              gs.name AS substation_name,
              gs.capacity_mw,
              COUNT(DISTINCT si.id) AS active_installations_count,
              COALESCE(SUM(lr.power_kw), 0) AS current_total_power_kw,
              COALESCE(SUM(tr.energy_today_kwh), 0) AS today_energy_kwh
          FROM grid_substations gs
          LEFT JOIN solar_installations si ON si.grid_substation_id = gs.id
          LEFT JOIN latest_readings lr ON lr.installation_id = si.id AND lr.rn = 1
          LEFT JOIN today_readings tr ON tr.installation_id = si.id
          WHERE gs.district_id = :districtId
          GROUP BY gs.id, gs.name, gs.capacity_mw
      )
      SELECT 
          d.id AS district_id,
          d.name AS district_name,
          ss.substation_id,
          ss.substation_name,
          ss.capacity_mw,
          ss.active_installations_count,
          ss.current_total_power_kw,
          ss.today_energy_kwh
      FROM districts d
      LEFT JOIN substation_stats ss ON 1=1
      WHERE d.id = :districtId;
    `;

    const rows = await sequelize.query(summaryQuery, {
      replacements: { districtId: id },
      type: QueryTypes.SELECT,
    });

    // If query returns 0 rows, the district does not exist in the database
    if (!rows || rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: `District with id '${id}' was not found.`,
      });
    }

    const firstRow = rows[0];
    const districtId = firstRow.district_id;
    const districtName = firstRow.district_name;

    let totalActiveInstallations = 0;
    let currentTotalPowerKw = 0;
    let todayTotalEnergyKwh = 0;
    const substationBreakdown = [];

    for (const row of rows) {
      if (row.substation_id) {
        const activeCount = parseInt(row.active_installations_count || 0, 10);
        const powerKw = parseFloat(row.current_total_power_kw || 0);
        const energyKwh = parseFloat(row.today_energy_kwh || 0);

        totalActiveInstallations += activeCount;
        currentTotalPowerKw += powerKw;
        todayTotalEnergyKwh += energyKwh;

        substationBreakdown.push({
          substation_id: row.substation_id,
          substation_name: row.substation_name,
          capacity_mw: parseFloat(row.capacity_mw || 0),
          active_installations_count: activeCount,
          current_total_power_kw: Math.round(powerKw * 1000) / 1000,
        });
      }
    }

    const payload = {
      district_id: districtId,
      district_name: districtName,
      total_active_installations: totalActiveInstallations,
      current_total_power_kw: Math.round(currentTotalPowerKw * 1000) / 1000,
      today_total_energy_kwh: Math.round(todayTotalEnergyKwh * 10000) / 10000,
      substation_breakdown: substationBreakdown,
    };

    // Calculate SHA-256 ETag for caching
    const hash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const etag = `"${hash}"`;

    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'public, max-age=30, must-revalidate');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    // Conditional GET: If-None-Match evaluation
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
  getDistrictSubstations,
  getDistrictSummary,
};
