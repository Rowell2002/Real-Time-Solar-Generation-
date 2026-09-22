'use strict';

const { Sequelize } = require('sequelize');
const {
  SolarInstallation,
  GridSubstation,
  District,
  Province,
  GenerationReading,
} = require('../models');

/**
 * GET /installations/:id/composite
 * Composite Resource:
 * Returns the installation metadata along with parent substation/district details and summary stats.
 */
async function getCompositeInstallation(req, res, next) {
  try {
    const { id } = req.params;

    // 1. Fetch Installation with full parent hierarchy
    const installation = await SolarInstallation.findByPk(id, {
      attributes: [
        'id',
        'name',
        'capacity_kw',
        'installation_type',
        'meter_id',
        'grid_substation_id',
        'createdAt',
        'updatedAt',
      ],
      include: [
        {
          model: GridSubstation,
          as: 'grid_substation',
          attributes: ['id', 'name', 'capacity_mw', 'district_id'],
          include: [
            {
              model: District,
              as: 'district',
              attributes: ['id', 'name', 'province_id'],
              include: [
                {
                  model: Province,
                  as: 'province',
                  attributes: ['id', 'name', 'code'],
                },
              ],
            },
          ],
        },
      ],
    });

    if (!installation) {
      return res.status(404).json({
        error: 'Not Found',
        message: `SolarInstallation with id '${id}' was not found.`,
      });
    }

    // 2. Compute aggregate summary stats from append-only GenerationReading telemetry
    const statsResult = await GenerationReading.findOne({
      where: { installation_id: id },
      attributes: [
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'total_readings'],
        [Sequelize.fn('MAX', Sequelize.col('power_kw')), 'max_power_kw_recorded'],
        [Sequelize.fn('AVG', Sequelize.col('voltage_v')), 'avg_voltage_v'],
        [Sequelize.fn('MIN', Sequelize.col('timestamp')), 'first_reading_timestamp'],
        [Sequelize.fn('MAX', Sequelize.col('timestamp')), 'last_reading_timestamp'],
      ],
      raw: true,
    });

    // 3. Fetch latest reading to get current cumulative energy_kwh
    const latestReading = await GenerationReading.findOne({
      where: { installation_id: id },
      attributes: ['energy_kwh', 'power_kw', 'timestamp'],
      order: [['timestamp', 'DESC']],
    });

    const totalReadings = parseInt(statsResult?.total_readings || 0, 10);
    const summaryStats = {
      total_readings: totalReadings,
      latest_cumulative_energy_kwh: latestReading ? parseFloat(latestReading.energy_kwh) : 0,
      current_power_kw: latestReading ? parseFloat(latestReading.power_kw) : 0,
      max_power_kw_recorded: statsResult?.max_power_kw_recorded ? parseFloat(statsResult.max_power_kw_recorded) : 0,
      avg_voltage_v: statsResult?.avg_voltage_v ? Math.round(parseFloat(statsResult.avg_voltage_v) * 100) / 100 : null,
      first_reading_timestamp: statsResult?.first_reading_timestamp || null,
      last_reading_timestamp: statsResult?.last_reading_timestamp || null,
    };

    return res.status(200).json({
      installation: {
        id: installation.id,
        name: installation.name,
        capacity_kw: installation.capacity_kw,
        installation_type: installation.installation_type,
        meter_id: installation.meter_id,
        grid_substation: installation.grid_substation,
        summary_stats: summaryStats,
        createdAt: installation.createdAt,
        updatedAt: installation.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /installations/:id/last-reading
 * Operational Read (Derived Resource):
 * Returns the single most recent GenerationReading record for the site.
 * Must be exposed as a derived resource route, not a raw DB table list.
 */
async function getLastReading(req, res, next) {
  try {
    const { id } = req.params;

    // Verify installation exists
    const installation = await SolarInstallation.findByPk(id, {
      attributes: ['id', 'name', 'meter_id'],
    });

    if (!installation) {
      return res.status(404).json({
        error: 'Not Found',
        message: `SolarInstallation with id '${id}' was not found.`,
      });
    }

    // High-performance query leveraging index ix_generation_readings_inst_time_desc
    const lastReading = await GenerationReading.findOne({
      where: { installation_id: id },
      attributes: ['id', 'installation_id', 'timestamp', 'power_kw', 'energy_kwh', 'voltage_v'],
      order: [['timestamp', 'DESC']],
    });

    if (!lastReading) {
      return res.status(404).json({
        error: 'Not Found',
        message: `No telemetry readings found for installation '${id}'.`,
      });
    }

    return res.status(200).json({
      installation_id: installation.id,
      meter_id: installation.meter_id,
      last_reading: {
        id: lastReading.id,
        timestamp: lastReading.timestamp,
        power_kw: parseFloat(lastReading.power_kw),
        energy_kwh: parseFloat(lastReading.energy_kwh),
        voltage_v: parseFloat(lastReading.voltage_v),
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getCompositeInstallation,
  getLastReading,
};
