'use strict';

const express = require('express');
const router = express.Router();

const provinceRoutes = require('./provinceRoutes');
const districtRoutes = require('./districtRoutes');
const substationRoutes = require('./substationRoutes');
const installationRoutes = require('./installationRoutes');

// Mount routes
router.use('/provinces', provinceRoutes);
router.use('/districts', districtRoutes);
router.use('/substations', substationRoutes);
router.use('/installations', installationRoutes);

module.exports = router;
