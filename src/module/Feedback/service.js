const httpStatus = require("http-status");
const ApiError = require("../../utils/ApiError");
const Feedback = require("./entity/model");

const createFeedback = async (body) => {
	const feedback = await Feedback.create(body);
	return feedback;
};
const queryFeedbacks = async (filter, options) => {
	const feedbacks = await Feedback.paginate(filter, options);
	return feedbacks;
};
const getFeedbackById = async (feedbackId) => {
	return Feedback.findById(feedbackId);
};
const updateFeedbackById = async (feedbackId, body) => {
	const feedback = await getFeedbackById(feedbackId);
	if (!feedback) {
		throw new ApiError(httpStatus.NOT_FOUND, "Feedback not found");
	}
	Object.assign(feedback, body);
	await feedback.save();
	return feedback;
};
const deleteFeedbackById = async (feedbackId) => {
	const feedback = await getFeedbackById(feedbackId);
	if (!feedback) {
		throw new ApiError(httpStatus.NOT_FOUND, "Feedback not found");
	}
	await feedback.remove();
	return feedback;
};

module.exports = {
	createFeedback,
	queryFeedbacks,
	getFeedbackById,
	updateFeedbackById,
	deleteFeedbackById,
};
