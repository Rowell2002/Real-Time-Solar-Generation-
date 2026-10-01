'use strict';

const express = require('express');
const router = express.Router();
const { getCompositeInstallation, getLastReading } = require('../controllers/installationController');
const { createReading, getReadingById, getInstallationReadings } = require('../controllers/readingController');
const { validateUuid } = require('../middleware/validateUuid');
const authenticateJwt = require('../middleware/authenticateJwt');
const authorizeDeviceWrite = require('../middleware/authorizeDeviceWrite');
const authorizeJurisdiction = require('../middleware/authorizeJurisdiction');

// 2. Composite Resource: GET /installations/:id/composite
router.get(
  '/:id/composite',
  validateUuid('id'),
  authenticateJwt,
  authorizeJurisdiction('installation'),
  getCompositeInstallation
);

// 3. Operational Read (Derived Resource): GET /installations/:id/last-reading
router.get(
  '/:id/last-reading',
  validateUuid('id'),
  authenticateJwt,
  authorizeJurisdiction('installation'),
  getLastReading
);

// 4. Device Ingestion (Write Path): POST /installations/:id/readings
// Enforces: JWT token with 'installation:write:{id}' scope matched against MySQL SolarInstallation
router.post(
  '/:id/readings',
  validateUuid('id'),
  authenticateJwt,
  authorizeDeviceWrite,
  createReading
);

// 5. Analytical Historical Readings: GET /installations/:id/readings
router.get(
  '/:id/readings',
  validateUuid('id'),
  authenticateJwt,
  authorizeJurisdiction('installation'),
  getInstallationReadings
);

// Location resolution: GET /installations/:id/readings/:readingId
router.get(
  '/:id/readings/:readingId',
  validateUuid('id'),
  authenticateJwt,
  authorizeJurisdiction('installation'),
  getReadingById
);

module.exports = router;
