'use strict';

const express = require('express');
const router = express.Router();
const { getCompositeInstallation, getLastReading } = require('../controllers/installationController');
const { createReading, getReadingById } = require('../controllers/readingController');
const { validateUuid } = require('../middleware/validateUuid');

// 2. Composite Resource: GET /installations/:id/composite
router.get('/:id/composite', validateUuid('id'), getCompositeInstallation);

// 3. Operational Read (Derived Resource): GET /installations/:id/last-reading
router.get('/:id/last-reading', validateUuid('id'), getLastReading);

// 4. Device Ingestion (Write Path): POST /installations/:id/readings
router.post('/:id/readings', validateUuid('id'), createReading);

// Location resolution: GET /installations/:id/readings/:readingId
router.get('/:id/readings/:readingId', validateUuid('id'), getReadingById);

module.exports = router;
