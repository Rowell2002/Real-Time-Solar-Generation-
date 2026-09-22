'use strict';

const { District, GridSubstation, Province } = require('../models');

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

module.exports = {
  getDistrictSubstations,
};
