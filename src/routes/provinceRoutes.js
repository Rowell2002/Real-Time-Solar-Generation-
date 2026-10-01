'use strict';

const express = require('express');
const router = express.Router();
const { getProvinces, getProvinceDistricts } = require('../controllers/provinceController');
const { validateUuid } = require('../middleware/validateUuid');
const authenticateJwt = require('../middleware/authenticateJwt');
const authorizeJurisdiction = require('../middleware/authorizeJurisdiction');

// GET /provinces (accessible to authenticated users)
router.get('/', authenticateJwt, authorizeJurisdiction('province'), getProvinces);

// GET /provinces/:id/districts (restricted by province jurisdiction)
router.get(
  '/:id/districts',
  validateUuid('id'),
  authenticateJwt,
  authorizeJurisdiction('province'),
  getProvinceDistricts
);

module.exports = router;
