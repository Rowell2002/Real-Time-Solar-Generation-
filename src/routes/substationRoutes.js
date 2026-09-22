'use strict';

const express = require('express');
const router = express.Router();
const { getSubstationInstallations } = require('../controllers/substationController');
const { validateUuid } = require('../middleware/validateUuid');

// GET /substations/:id/installations
router.get('/:id/installations', validateUuid('id'), getSubstationInstallations);

module.exports = router;
