'use strict';

const express = require('express');
const router = express.Router();
const { getDistrictSubstations, getDistrictSummary } = require('../controllers/districtController');
const { validateUuid } = require('../middleware/validateUuid');

// Operational Dashboard Summary: GET /districts/:id/summary
router.get('/:id/summary', validateUuid('id'), getDistrictSummary);

// GET /districts/:id/substations
router.get('/:id/substations', validateUuid('id'), getDistrictSubstations);

module.exports = router;
