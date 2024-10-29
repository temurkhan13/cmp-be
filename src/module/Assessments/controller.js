const httpStatus = require('http-status');
const catchAsync = require('../../utils/catchAsync');
const service = require('./service');
const tokenService = require('../tokens/service');
const pick = require('../../utils/pick');

const createAssessment = catchAsync(async (req, res) => {
  const { user, body } = req;
  console.log('req body====', body);
  if (body.generalInfo) {
    body.messages = [
      {
        text: body.message,
        generalInfo: body.generalInfo,
        assessmentName: body.assessmentName,
        sender: user._id,
      },
    ];
  }
  body.user = user._id;
  const chat = await service.createAssessment(body);
  res.status(httpStatus.OK).send(chat);
});

const createSurvey = catchAsync(async (req, res) => {
  const { user, body } = req;
  console.log('req body====', body);
  if (body.generalInfo) {
    body.messages = [
      {
        text: body.message,
        generalInfo: body.generalInfo,
        surveyType: body.surveyType,
        sender: user._id,
      },
    ];
  }
  body.user = user._id;
  const chat = await service.createSurvey(
    body,
    body.generalInfo,
    body.surveyType
  );
  res.status(httpStatus.OK).send(chat);
});

const get = catchAsync(async (req, res) => {
  const { id } = req.params;
  const doc = await service.get(id);
  res.status(httpStatus.OK).send(doc);
});

const updateAssessment = catchAsync(async (req, res) => {
  const { user, body } = req;
  const { id } = req.params;
  console.log('req body====', body);

  if (body.generalInfo) {
    body.messages = [
      {
        text: body.message,
        generalInfo: body.generalInfo,
        assessmentName: body.assessmentName,
        sender: user._id,
      },
    ];
  }

  // const message = {
  //   text: body.message,
  //   generalInfo: body.generalInfo,
  //   assessmentType: body.assessmentType,
  //   sender: user._id,
  // };
  body.user = user._id;
  const chat = await service.updateAssessment(id, body);
  res.status(httpStatus.OK).send(chat);
});
const updateSurvey = catchAsync(async (req, res) => {
  const { user, body } = req;
  const { id } = req.params;
  console.log('req body====', body);

  const message = {
    text: body.message,
    generalInfo: body.generalInfo,
    surveyType: body.surveyType, // Correct the spelling if necessary
    sender: user._id,
  };

  const chat = await service.updateSurvey(id, message, user._id);
  res.status(httpStatus.OK).send(chat);
});

const createCheckChat = catchAsync(async (req, res) => {
  const { user, body } = req;
  console.log('req body====', body);
  if (body.generalInfo) {
    body.messages = [
      {
        text: body.message,
        generalInfo: body.generalInfo,
        surveyType: body.surveyType,
        sender: user._id,
      },
    ];
  }
  body.user = user._id;
  const chat = await service.createCheckChat(
    body,
    body.generalInfo,
    body.checkType
  );
  res.status(httpStatus.OK).send(chat);
});

const updateCheckChat = catchAsync(async (req, res) => {
  const { user, body } = req;
  const { id } = req.params;
  console.log('req body====', body);

  const message = {
    text: body.message,
    generalInfo: body.generalInfo,
    checkType: body.checkType, // Correct the spelling if necessary
    sender: user._id,
  };

  const chat = await service.updateCheckChat(id, message, user._id);
  res.status(httpStatus.OK).send(chat);
});
const inspireMe = catchAsync(async (req, res) => {
  const { body } = req;
  console.log('req body====', body);

  const message = {
    message: body.message,
    general_info: body.generalInfo,
    business_info: body.bussinessInfo,
  };

  const chat = await service.inspireMe(message);
  res.status(httpStatus.OK).send(chat);
});

module.exports = {
  createAssessment,
  createSurvey,
  updateAssessment,
  updateSurvey,
  get,
  createCheckChat,
  updateCheckChat,
  inspireMe,
};
