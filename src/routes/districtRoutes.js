'use strict';

const express = require('express');
const router = express.Router();
const { getDistrictSubstations } = require('../controllers/districtController');
const { validateUuid } = require('../middleware/validateUuid');

// GET /districts/:id/substations
router.get('/:id/substations', validateUuid('id'), getDistrictSubstations);

module.exports = router;
