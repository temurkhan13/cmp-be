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
  const chat = await service.create(body);
  res.status(httpStatus.OK).send(chat);
});

const changeTone = catchAsync(async (req, res) => {
  const { body } = req;
  const changeTone = await service.changeTone(body);
  res.status(httpStatus.OK).send(changeTone);
});

const translate = catchAsync(async (req, res) => {
  const { body } = req;
  const translate = await service.translate(body);
  res.status(httpStatus.OK).send(translate);
});

module.exports = {
  create,
  changeTone,
  translate,
};
