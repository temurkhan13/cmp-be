const httpStatus = require('http-status');
const catchAsync = require('../../utils/catchAsync');
const projectService = require('./service');
const tokenService = require('../tokens/service');
const pick = require('../../utils/pick');

const create = catchAsync(async (req, res) => {
  const user = await projectService.create(req.body);
  const tokens = await tokenService.generateAuthTokens(user);
  res.status(httpStatus.CREATED).send({ user, tokens });
});

module.exports = {
  create,
};
