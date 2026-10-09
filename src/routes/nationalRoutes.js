'use strict';

const express = require('express');
const router = express.Router();
const { getNationalSummary } = require('../controllers/nationalController');
const authenticateJwt = require('../middleware/authenticateJwt');
const { apiLimiter } = require('../middleware/rateLimiter');

// GET /national/summary - National operational solar generation dashboard
router.get('/summary', apiLimiter, authenticateJwt, getNationalSummary);

module.exports = router;
