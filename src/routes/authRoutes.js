'use strict';

const express = require('express');
const router = express.Router();
const { login, issueDeviceToken, getMe } = require('../controllers/authController');
const authenticateJwt = require('../middleware/authenticateJwt');
const { createRateLimiter } = require('../middleware/rateLimiter');

// Rate limiter for authentication to prevent brute force (30 requests/minute)
const authLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 30 });

// POST /auth/login - Authenticate user credentials & issue JWT
router.post('/login', authLimiter, login);

// POST /auth/device-token - Issue hardware meter device write token
router.post('/device-token', authLimiter, issueDeviceToken);

// GET /auth/me - Verify current token and inspect identity claims
router.get('/me', authenticateJwt, getMe);

module.exports = router;
