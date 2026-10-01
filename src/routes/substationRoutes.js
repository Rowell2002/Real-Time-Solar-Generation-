'use strict';

const express = require('express');
const router = express.Router();
const { getSubstationInstallations } = require('../controllers/substationController');
const { validateUuid } = require('../middleware/validateUuid');
const authenticateJwt = require('../middleware/authenticateJwt');
const authorizeJurisdiction = require('../middleware/authorizeJurisdiction');

// Scoped Collection: GET /substations/:id/installations
router.get(
  '/:id/installations',
  validateUuid('id'),
  authenticateJwt,
  authorizeJurisdiction('substation'),
  getSubstationInstallations
);

module.exports = router;
