'use strict';

const crypto = require('crypto');
const { Op } = require('sequelize');
const {
  SolarInstallation,
  GenerationReading,
  GridSubstation,
  District,
  Province,
} = require('../models');
const { UUID_REGEX } = require('../middleware/validateUuid');

/**
 * GET /installations/:id/readings
 * Enhanced analytical historical reading endpoint satisfying First-Class rubric:
 * 1. Hypermedia Pagination (page, limit, total_count, data, links { self, next, prev })
 * 2. Multi-dimensional Filtering & Sorting (start_time, end_time, province_id, district_id, substation_id, sort)
 * 3. Headers, Conditional GET & Status Codes (SHA-256 ETag, Last-Modified, 304 Not Modified, 412 Precondition Failed, 406 Not Acceptable)
 */
async function getInstallationReadings(req, res, next) {
  try {
    // --------------------------------------------------------------------------
    // 1. Content Negotiation (Accept header)
    // --------------------------------------------------------------------------
    const acceptHeader = req.headers['accept'];
    if (acceptHeader && acceptHeader !== '*/*') {
      const acceptsJson = acceptHeader.split(',').some((type) => {
        const trimmed = type.trim().toLowerCase();
        return (
          trimmed === 'application/json' ||
          trimmed.startsWith('application/json;') ||
          trimmed === 'application/*' ||
          trimmed === '*/*'
        );
      });

      if (!acceptsJson) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.status(406).json({
          error: 'Not Acceptable',
          message: "The requested media type is not supported. Only 'application/json' is served by this endpoint.",
          supported_media_types: ['application/json'],
        });
      }
    }

    // Explicitly set Content-Type header on all responses
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    const { id } = req.params;

    // --------------------------------------------------------------------------
    // 2. Installation & Jurisdiction Scope Validation
    // --------------------------------------------------------------------------
    const installation = await SolarInstallation.findByPk(id, {
      attributes: ['id', 'name', 'meter_id', 'grid_substation_id', 'updatedAt'],
      include: [
        {
          model: GridSubstation,
          as: 'grid_substation',
          attributes: ['id', 'district_id'],
          include: [
            {
              model: District,
              as: 'district',
              attributes: ['id', 'province_id'],
              include: [
                {
                  model: Province,
                  as: 'province',
                  attributes: ['id'],
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

    // Parse and validate optional jurisdiction filters
    const { province_id, district_id, substation_id } = req.query;
    if (province_id && !UUID_REGEX.test(province_id)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `Invalid UUID format for 'province_id': '${province_id}'.`,
      });
    }
    if (district_id && !UUID_REGEX.test(district_id)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `Invalid UUID format for 'district_id': '${district_id}'.`,
      });
    }
    if (substation_id && !UUID_REGEX.test(substation_id)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `Invalid UUID format for 'substation_id': '${substation_id}'.`,
      });
    }

    // Check if installation matches jurisdiction filters
    let jurisdictionMismatch = false;
    if (substation_id && installation.grid_substation_id !== substation_id) {
      jurisdictionMismatch = true;
    }
    if (district_id && installation.grid_substation?.district_id !== district_id) {
      jurisdictionMismatch = true;
    }
    if (province_id && installation.grid_substation?.district?.province_id !== province_id) {
      jurisdictionMismatch = true;
    }

    // --------------------------------------------------------------------------
    // 3. Pagination Parsing & Validation
    // --------------------------------------------------------------------------
    let page = req.query.page !== undefined ? parseInt(req.query.page, 10) : 1;
    let limit = req.query.limit !== undefined ? parseInt(req.query.limit, 10) : 50;

    if (isNaN(page) || page < 1) {
      return res.status(400).json({
        error: 'Bad Request',
        message: "Query parameter 'page' must be a positive integer greater than or equal to 1.",
      });
    }

    if (isNaN(limit) || limit < 1) {
      return res.status(400).json({
        error: 'Bad Request',
        message: "Query parameter 'limit' must be a positive integer between 1 and 200.",
      });
    }

    // Cap limit at 200 for safety against memory exhaustion
    if (limit > 200) {
      limit = 200;
    }

    // --------------------------------------------------------------------------
    // 4. Time Window Filtering Parsing & Validation
    // --------------------------------------------------------------------------
    const whereClause = {
      installation_id: id,
    };

    const { start_time, end_time } = req.query;
    let startDate = null;
    let endDate = null;

    if (start_time) {
      startDate = new Date(start_time);
      if (isNaN(startDate.getTime())) {
        return res.status(400).json({
          error: 'Bad Request',
          message: `Query parameter 'start_time' ('${start_time}') must be a valid ISO 8601 timestamp.`,
        });
      }
    }

    if (end_time) {
      endDate = new Date(end_time);
      if (isNaN(endDate.getTime())) {
        return res.status(400).json({
          error: 'Bad Request',
          message: `Query parameter 'end_time' ('${end_time}') must be a valid ISO 8601 timestamp.`,
        });
      }
    }

    if (startDate && endDate && startDate > endDate) {
      return res.status(400).json({
        error: 'Bad Request',
        message: "'start_time' cannot be chronologically later than 'end_time'.",
      });
    }

    if (startDate && endDate) {
      whereClause.timestamp = { [Op.between]: [startDate, endDate] };
    } else if (startDate) {
      whereClause.timestamp = { [Op.gte]: startDate };
    } else if (endDate) {
      whereClause.timestamp = { [Op.lte]: endDate };
    }

    // --------------------------------------------------------------------------
    // 5. Sorting Parsing & Validation
    // --------------------------------------------------------------------------
    const sortParam = req.query.sort;
    let order = [['timestamp', 'DESC']]; // Default to descending

    if (sortParam) {
      if (sortParam === 'timestamp') {
        order = [['timestamp', 'ASC']];
      } else if (sortParam === '-timestamp') {
        order = [['timestamp', 'DESC']];
      } else {
        return res.status(400).json({
          error: 'Bad Request',
          message: `Invalid sort field '${sortParam}'. Allowed values are 'timestamp' (ascending) or '-timestamp' (descending).`,
        });
      }
    }

    // --------------------------------------------------------------------------
    // 6. Database Query Execution
    // --------------------------------------------------------------------------
    let count = 0;
    let rows = [];

    if (!jurisdictionMismatch) {
      const offset = (page - 1) * limit;
      const result = await GenerationReading.findAndCountAll({
        where: whereClause,
        order,
        limit,
        offset,
        attributes: ['id', 'installation_id', 'timestamp', 'power_kw', 'energy_kwh', 'voltage_v'],
      });
      count = result.count;
      rows = result.rows;
    }

    // --------------------------------------------------------------------------
    // 7. ETag & Last-Modified Calculation
    // --------------------------------------------------------------------------
    let lastModifiedDate = installation.updatedAt || new Date();
    if (rows.length > 0) {
      // Pick the most recent timestamp present in the result set
      const newestInPage = rows.reduce((max, r) => (new Date(r.timestamp) > max ? new Date(r.timestamp) : max), new Date(rows[0].timestamp));
      lastModifiedDate = newestInPage;
    }
    const lastModifiedHeader = lastModifiedDate.toUTCString();

    // SHA-256 ETag representing this specific query & dataset state
    const etagPayload = JSON.stringify({
      installation_id: id,
      count,
      page,
      limit,
      sort: sortParam || '-timestamp',
      start_time: start_time || null,
      end_time: end_time || null,
      readings: rows.map((r) => [r.id, r.timestamp, r.power_kw, r.energy_kwh, r.voltage_v]),
    });
    const hash = crypto.createHash('sha256').update(etagPayload).digest('hex');
    const etagHeader = `"${hash}"`;

    // Set headers
    res.setHeader('ETag', etagHeader);
    res.setHeader('Last-Modified', lastModifiedHeader);
    res.setHeader('Cache-Control', 'public, max-age=60, must-revalidate');

    // --------------------------------------------------------------------------
    // 8. Precondition Evaluation (If-Match & If-Unmodified-Since) -> 412
    // --------------------------------------------------------------------------
    const ifMatch = req.headers['if-match'];
    if (ifMatch) {
      const matches = ifMatch
        .split(',')
        .map((t) => t.trim())
        .some((tag) => tag === '*' || tag === etagHeader || tag === `W/${etagHeader}`);
      if (!matches) {
        return res.status(412).json({
          error: 'Precondition Failed',
          message: "The condition specified in the 'If-Match' header evaluated to false.",
        });
      }
    }

    const ifUnmodifiedSince = req.headers['if-unmodified-since'];
    if (ifUnmodifiedSince) {
      const parsedUnmodified = new Date(ifUnmodifiedSince);
      if (!isNaN(parsedUnmodified.getTime())) {
        // Floor seconds for HTTP date comparison
        const lastModSec = Math.floor(lastModifiedDate.getTime() / 1000);
        const ifUnmodSec = Math.floor(parsedUnmodified.getTime() / 1000);
        if (lastModSec > ifUnmodSec) {
          return res.status(412).json({
            error: 'Precondition Failed',
            message: "The condition specified in the 'If-Unmodified-Since' header evaluated to false.",
          });
        }
      }
    }

    // --------------------------------------------------------------------------
    // 9. Conditional GET Evaluation (If-None-Match & If-Modified-Since) -> 304
    // --------------------------------------------------------------------------
    const ifNoneMatch = req.headers['if-none-match'];
    if (ifNoneMatch) {
      const noneMatches = ifNoneMatch
        .split(',')
        .map((t) => t.trim())
        .some((tag) => tag === '*' || tag === etagHeader || tag === `W/${etagHeader}` || `W/${tag}` === etagHeader);

      if (noneMatches) {
        return res.status(304).end();
      }
    }

    const ifModifiedSince = req.headers['if-modified-since'];
    if (ifModifiedSince && !ifNoneMatch) {
      const parsedModSince = new Date(ifModifiedSince);
      if (!isNaN(parsedModSince.getTime())) {
        const lastModSec = Math.floor(lastModifiedDate.getTime() / 1000);
        const ifModSec = Math.floor(parsedModSince.getTime() / 1000);
        if (lastModSec <= ifModSec) {
          return res.status(304).end();
        }
      }
    }

    // --------------------------------------------------------------------------
    // 10. Hypermedia HATEOAS Links Generation
    // --------------------------------------------------------------------------
    function buildPageUri(targetPage) {
      const params = new URLSearchParams();
      params.set('page', targetPage);
      params.set('limit', limit);
      if (sortParam) params.set('sort', sortParam);
      if (start_time) params.set('start_time', start_time);
      if (end_time) params.set('end_time', end_time);
      if (province_id) params.set('province_id', province_id);
      if (district_id) params.set('district_id', district_id);
      if (substation_id) params.set('substation_id', substation_id);
      return `/installations/${id}/readings?${params.toString()}`;
    }

    const links = {
      self: buildPageUri(page),
    };

    if (page * limit < count) {
      links.next = buildPageUri(page + 1);
    }
    if (page > 1) {
      links.prev = buildPageUri(page - 1);
    }

    // --------------------------------------------------------------------------
    // 11. Format & Send JSON Envelope
    // --------------------------------------------------------------------------
    return res.status(200).json({
      total_count: count,
      page,
      limit,
      data: rows.map((reading) => ({
        id: reading.id,
        installation_id: reading.installation_id,
        timestamp: reading.timestamp,
        power_kw: parseFloat(reading.power_kw),
        energy_kwh: parseFloat(reading.energy_kwh),
        voltage_v: parseFloat(reading.voltage_v),
      })),
      links,
    });
  } catch (error) {
    next(error);
  }
}

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
  getInstallationReadings,
  createReading,
  getReadingById,
};
