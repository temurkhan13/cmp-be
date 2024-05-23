const httpStatus = require('http-status');
const catchAsync = require('../../utils/catchAsync');
const service = require('./service');
const tokenService = require('../tokens/service');
const pick = require('../../utils/pick');

const create = catchAsync(async (req, res) => {
  const { body } = req;
  if (req.file) {
    body.pdfPath = req.file.filename;
  }
  const lesson = await service.create(body);
  res.status(httpStatus.OK).send(lesson);
});

module.exports = {
  create,
};
