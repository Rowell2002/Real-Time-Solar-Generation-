'use strict';

const express = require('express');
const router = express.Router();
const { getProvinces, getProvinceDistricts } = require('../controllers/provinceController');
const { validateUuid } = require('../middleware/validateUuid');

// GET /provinces
router.get('/', getProvinces);

// GET /provinces/:id/districts
router.get('/:id/districts', validateUuid('id'), getProvinceDistricts);

module.exports = router;
