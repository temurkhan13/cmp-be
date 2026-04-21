const httpStatus = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const service = require("./service");

const createAssessment = catchAsync(async (req, res) => {
  const { user, body } = req;
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
  const chat = await service.createSurvey(body, body.generalInfo, body.surveyType);
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
  const message = {
    text: body.message,
    generalInfo: body.generalInfo,
    surveyType: body.surveyType,
    sender: user._id,
  };

  const chat = await service.updateSurvey(id, message, user._id);
  res.status(httpStatus.OK).send(chat);
});

const createCheckChat = catchAsync(async (req, res) => {
  const { user, body } = req;
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
  const chat = await service.createCheckChat(body, body.generalInfo, body.checkType);
  res.status(httpStatus.OK).send(chat);
});

const updateCheckChat = catchAsync(async (req, res) => {
  const { user, body } = req;
  const { id } = req.params;
  const message = {
    text: body.message,
    generalInfo: body.generalInfo,
    checkType: body.checkType,
    sender: user._id,
  };

  const chat = await service.updateCheckChat(id, message, user._id);
  res.status(httpStatus.OK).send(chat);
});
const inspireMe = catchAsync(async (req, res) => {
  const { body } = req;
  const message = {
    message: body.message,
    general_info: body.generalInfo,
    business_info: body.bussinessInfo,
  };

  const chat = await service.inspireMe(message);
  res.status(httpStatus.OK).send(chat);
});

const saveVersion = catchAsync(async (req, res) => {
  const { id } = req.params;
  const version = await service.saveVersion(id);
  if (!version) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .send({ message: "No report found to save as version" });
  }
  res.status(httpStatus.CREATED).send(version);
});

const getVersions = catchAsync(async (req, res) => {
  const { id } = req.params;
  const versions = await service.getVersions(id);
  res.status(httpStatus.OK).send(versions);
});

const restoreVersion = catchAsync(async (req, res) => {
  const { id, versionId } = req.params;
  const result = await service.restoreVersion(id, versionId);
  res.status(httpStatus.OK).send(result);
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
  saveVersion,
  getVersions,
  restoreVersion,
};
