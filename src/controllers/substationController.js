'use strict';

const { GridSubstation, SolarInstallation, District } = require('../models');

/**
 * GET /substations/:id/installations
 * Scoped collection: Retrieve all solar installations interconnected to a specific grid substation.
 */
async function getSubstationInstallations(req, res, next) {
  try {
    const { id } = req.params;

    const substation = await GridSubstation.findByPk(id, {
      attributes: ['id', 'name', 'capacity_mw', 'district_id'],
      include: [
        {
          model: District,
          as: 'district',
          attributes: ['id', 'name'],
        },
        {
          model: SolarInstallation,
          as: 'solar_installations',
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
        },
      ],
      order: [[{ model: SolarInstallation, as: 'solar_installations' }, 'name', 'ASC']],
    });

    if (!substation) {
      return res.status(404).json({
        error: 'Not Found',
        message: `GridSubstation with id '${id}' was not found.`,
      });
    }

    return res.status(200).json({
      substation: {
        id: substation.id,
        name: substation.name,
        capacity_mw: substation.capacity_mw,
        district: substation.district,
      },
      count: substation.solar_installations.length,
      data: substation.solar_installations,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getSubstationInstallations,
};
