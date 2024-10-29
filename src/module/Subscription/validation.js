const Joi = require("joi");
const { objectId } = require("../../utils/custom.validation");

const getSubscriptions = {
	query: Joi.object().keys({
		limit: Joi.number().integer(),
		page: Joi.number().integer(),
	}),
};
const createSubscription = {
	body: Joi.object().keys({
		subscriptionId: Joi.string().custom(objectId).required(),
	}),
};
const upgradeSubscription = {
	params: Joi.object().keys({
		subscriptionId: Joi.string().custom(objectId).required(),
	}),
	body: Joi.object().keys({
		newPriceId: Joi.string().required(),
	}),
};
const cancelSubscription = {
	params: Joi.object().keys({
		subscriptionId: Joi.string().custom(objectId).required(),
	}),
};

module.exports = {
	getSubscriptions,
	createSubscription,
	upgradeSubscription,
	cancelSubscription,
};
