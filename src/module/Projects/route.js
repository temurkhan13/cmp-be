const express = require('express');
const controller = require('./controller');
const validation = require('./validation');
const validate = require('../../middlewares/validate');
const auth = require('../../middlewares/auth');

const router = express.Router();

router.route('/').post(validate(validation.register), controller.create);

module.exports = {
  authRoutes: router,
};
