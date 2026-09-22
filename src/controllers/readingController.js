'use strict';

const { SolarInstallation, GenerationReading } = require('../models');

/**
 * POST /installations/:id/readings
 * Device Ingestion (Write Path):
 * Appends a new GenerationReading. Returns 201 Created with a 'Location' header pointing to the created reading URI.
 */
async function createReading(req, res, next) {
  try {
    const { id } = req.params;
    const { timestamp, power_kw, energy_kwh, voltage_v } = req.body;

    // 1. Verify installation exists
    const installation = await SolarInstallation.findByPk(id, {
      attributes: ['id', 'name', 'meter_id'],
    });

    if (!installation) {
      return res.status(404).json({
        error: 'Not Found',
        message: `SolarInstallation with id '${id}' was not found.`,
      });
    }

    // 2. Validate payload attributes
    const errors = [];
    if (!timestamp) {
      errors.push({ field: 'timestamp', message: 'timestamp is required.' });
    } else {
      const parsedDate = new Date(timestamp);
      if (isNaN(parsedDate.getTime())) {
        errors.push({ field: 'timestamp', message: 'timestamp must be a valid ISO 8601 date string.' });
      }
    }

    if (power_kw === undefined || power_kw === null || isNaN(Number(power_kw)) || Number(power_kw) < 0) {
      errors.push({ field: 'power_kw', message: 'power_kw must be a non-negative number.' });
    }

    if (energy_kwh === undefined || energy_kwh === null || isNaN(Number(energy_kwh)) || Number(energy_kwh) < 0) {
      errors.push({ field: 'energy_kwh', message: 'energy_kwh must be a non-negative number.' });
    }

    if (voltage_v === undefined || voltage_v === null || isNaN(Number(voltage_v)) || Number(voltage_v) < 0) {
      errors.push({ field: 'voltage_v', message: 'voltage_v must be a non-negative number.' });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid reading payload.',
        details: errors,
      });
    }

    // 3. Append-only insert into generation_readings
    const reading = await GenerationReading.create({
      installation_id: id,
      timestamp: new Date(timestamp),
      power_kw: Number(power_kw),
      energy_kwh: Number(energy_kwh),
      voltage_v: Number(voltage_v),
    });

    // 4. Construct Location header
    const locationUri = `/installations/${id}/readings/${reading.id}`;
    res.setHeader('Location', locationUri);

    return res.status(201).json({
      message: 'Telemetry reading successfully recorded.',
      data: {
        id: reading.id,
        installation_id: reading.installation_id,
        timestamp: reading.timestamp,
        power_kw: parseFloat(reading.power_kw),
        energy_kwh: parseFloat(reading.energy_kwh),
        voltage_v: parseFloat(reading.voltage_v),
      },
      _links: {
        self: { href: locationUri },
        installation: { href: `/installations/${id}` },
        last_reading: { href: `/installations/${id}/last-reading` },
      },
    });
  } catch (error) {
    // Handle unique timestamp per installation constraint
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({
        error: 'Conflict',
        message: 'A telemetry reading with this exact timestamp already exists for this installation.',
      });
    }
    next(error);
  }
}

/**
 * GET /installations/:id/readings/:readingId
 * Resolves the URI generated in the Location header.
 */
async function getReadingById(req, res, next) {
  try {
    const { id, readingId } = req.params;

    const reading = await GenerationReading.findOne({
      where: {
        id: readingId,
        installation_id: id,
      },
    });

    if (!reading) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Reading with id '${readingId}' for installation '${id}' was not found.`,
      });
    }

    return res.status(200).json({
      data: {
        id: reading.id,
        installation_id: reading.installation_id,
        timestamp: reading.timestamp,
        power_kw: parseFloat(reading.power_kw),
        energy_kwh: parseFloat(reading.energy_kwh),
        voltage_v: parseFloat(reading.voltage_v),
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createReading,
  getReadingById,
};
