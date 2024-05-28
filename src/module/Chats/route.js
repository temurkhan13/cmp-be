const express = require('express');
const controller = require('./controller');
const validation = require('./validation');
const validate = require('../../middlewares/validate');
const auth = require('../../middlewares/auth');
const { fileUpload } = require('../../utils/fileUpload');

const router = express.Router();

router
  .route('/')
  .post(auth(), fileUpload.single('pdfPath'), controller.create)
  .post(auth(), controller.changeTone)
  .post(auth(), controller.translate);

module.exports = {
  chatRoutes: router,
};
