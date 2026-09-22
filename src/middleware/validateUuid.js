'use strict';

// Standard UUID regex (v1-v5)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Middleware generator to validate that specified route params are valid UUIDs.
 * Prevents PostgreSQL syntax errors from malformed UUID queries.
 *
 * @param  {...string} paramNames - Route param names to validate (e.g. 'id', 'provinceId')
 * @returns {import('express').RequestHandler}
 */
function validateUuid(...paramNames) {
  return (req, res, next) => {
    for (const param of paramNames) {
      const value = req.params[param];
      if (value && !UUID_REGEX.test(value)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: `Invalid UUID parameter '${param}': '${value}' is not a valid UUID.`,
        });
      }
    }
    next();
  };
}

module.exports = { validateUuid, UUID_REGEX };
