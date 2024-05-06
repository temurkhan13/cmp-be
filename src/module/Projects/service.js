const httpStatus = require('http-status');
const ApiError = require('../../utils/ApiError');
const { tokenTypes } = require('../../config/tokens');
const Project = require('./entity/model');
const Token = require('../tokens/entity/model');

const create = async (body) => {
  return await Project.create(body);
};

module.exports = {
  create,
};
