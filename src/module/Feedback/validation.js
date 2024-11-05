const Joi = require("joi");
const { objectId } = require("../../utils/custom.validation");

const createFeedback = {
	body: Joi.object().keys({
		rating: Joi.number().min(1).max(5).required(),
		category: Joi.object().keys({
			name: Joi.string().required(),
			subcategories: Joi.array().items(
				Joi.object().keys({
					name: Joi.string().required(),
					selected: Joi.boolean(),
				}),
			),
		}),
		feedbackText: Joi.string().required(),
	}),
};
const getFeedbacks = {
	query: Joi.object().keys({
		limit: Joi.number().integer(),
		page: Joi.number().integer(),
		sortBy: Joi.string(),
		userId: Joi.string().custom(objectId),
	}),
};
const getFeedback = {
	params: Joi.object().keys({
		feedbackId: Joi.string().custom(objectId),
	}),
};
const updateFeedback = {
	params: Joi.object().keys({
		feedbackId: Joi.required().custom(objectId),
	}),
	body: Joi.object().keys({
		rating: Joi.number().min(1).max(5),
		category: Joi.object().keys({
			name: Joi.string(),
			subcategories: Joi.array().items(
				Joi.object().keys({
					name: Joi.string(),
					selected: Joi.boolean(),
				}),
			),
		}),
		feedbackText: Joi.string(),
	}),
};
const deleteFeedback = {
	params: Joi.object().keys({
		feedbackId: Joi.string().custom(objectId),
	}),
};

module.exports = {
	createFeedback,
	getFeedbacks,
	getFeedback,
	updateFeedback,
	deleteFeedback,
};
