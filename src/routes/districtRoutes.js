'use strict';

const express = require('express');
const router = express.Router();
const { getDistrictSubstations, getDistrictSummary } = require('../controllers/districtController');
const { validateUuid } = require('../middleware/validateUuid');
const authenticateJwt = require('../middleware/authenticateJwt');
const authorizeJurisdiction = require('../middleware/authorizeJurisdiction');

// Operational Dashboard Summary: GET /districts/:id/summary
router.get(
  '/:id/summary',
  validateUuid('id'),
  authenticateJwt,
  authorizeJurisdiction('district'),
  getDistrictSummary
);

// Scoped Collection: GET /districts/:id/substations
router.get(
  '/:id/substations',
  validateUuid('id'),
  authenticateJwt,
  authorizeJurisdiction('district'),
  getDistrictSubstations
);

module.exports = router;
