const httpStatus = require("http-status");
const ApiError = require("../../utils/ApiError");
const catchAsync = require("../../utils/catchAsync");
const service = require("./service");
const pick = require("../../utils/pick");

const createFeedback = catchAsync(async (req, res) => {
  const { user, body } = req;
  const { _id: userId } = user;
  body.userId = userId;

  const feedback = await service.createFeedback(body);
  res.status(httpStatus.CREATED).send(feedback);
});
const getFeedbacks = catchAsync(async (req, res) => {
  const filter = pick(req.query, ["userId"]);
  const options = pick(req.query, ["sortBy", "limit", "page"]);
  const result = await service.queryFeedbacks(filter, options);
  res.send(result);
});
const getFeedback = catchAsync(async (req, res) => {
  const feedback = await service.getFeedbackById(req.params.feedbackId);
  if (!feedback) {
    throw new ApiError(httpStatus.NOT_FOUND, "Feedback not found");
  }
  res.send(feedback);
});
const updateFeedback = catchAsync(async (req, res) => {
  const feedback = await service.updateFeedbackById(req.params.feedbackId, req.body);
  res.send(feedback);
});
const deleteFeedback = catchAsync(async (req, res) => {
  await service.deleteFeedbackById(req.params.feedbackId);
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  createFeedback,
  getFeedbacks,
  getFeedback,
  updateFeedback,
  deleteFeedback,
};
