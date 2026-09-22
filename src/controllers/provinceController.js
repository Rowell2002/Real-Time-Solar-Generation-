'use strict';

const { Province, District } = require('../models');

/**
 * GET /provinces
 * Retrieve all 9 administrative provinces of Sri Lanka.
 */
async function getProvinces(req, res, next) {
  try {
    const provinces = await Province.findAll({
      attributes: ['id', 'name', 'code', 'createdAt', 'updatedAt'],
      order: [['name', 'ASC']],
    });
    return res.status(200).json({
      count: provinces.length,
      data: provinces,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /provinces/:id/districts
 * Scoped collection: Retrieve all districts belonging to a specific province.
 */
async function getProvinceDistricts(req, res, next) {
  try {
    const { id } = req.params;

    const province = await Province.findByPk(id, {
      attributes: ['id', 'name', 'code'],
      include: [
        {
          model: District,
          as: 'districts',
          attributes: ['id', 'name', 'province_id', 'createdAt', 'updatedAt'],
        },
      ],
      order: [[{ model: District, as: 'districts' }, 'name', 'ASC']],
    });

    if (!province) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Province with id '${id}' was not found.`,
      });
    }

    return res.status(200).json({
      province: {
        id: province.id,
        name: province.name,
        code: province.code,
      },
      count: province.districts.length,
      data: province.districts,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getProvinces,
  getProvinceDistricts,
};
