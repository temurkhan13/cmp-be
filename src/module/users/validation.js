const Joi = require("joi");
const { password, objectId } = require("../../utils/custom.validation");

const register = {
	body: Joi.object().keys({
		email: Joi.string().required().description("email is required"),
		password: Joi.string().required().description("Password is required").min(8).custom(password),
		firstName: Joi.string().required().description("firstName is required"),
		lastName: Joi.string().required().description("lastName is required"),
		companyName: Joi.string().required().description("companyName is required"),
	}),
};

const login = {
	body: Joi.object().keys({
		email: Joi.string().required(),
		password: Joi.string().required(),
	}),
};

const logout = {
	body: Joi.object().keys({
		refreshToken: Joi.string().required(),
	}),
};

const queryUsers = {
	query: Joi.object().keys({
		limit: Joi.number().integer(),
		page: Joi.number().integer(),
	}),
};

const getUser = {
	params: Joi.object().keys({
		userId: Joi.string().custom(objectId),
	}),
};

const updateUser = {
	params: Joi.object().keys({
		userId: Joi.required().custom(objectId),
	}),
	body: Joi.object().keys({
		email: Joi.string().email(),
		password: Joi.string().custom(password),
		firstName: Joi.string(),
		lastName: Joi.string(),
		role: Joi.string(),
		companyName: Joi.string(),
		userName: Joi.string(),
	}),
};

const deleteUser = {
	params: Joi.object().keys({
		userId: Joi.string().custom(objectId),
	}),
};

const deviceToken = {
	body: Joi.object().keys({
		userId: Joi.string().custom(objectId).required(),
		addToken: Joi.boolean().required(),
		deviceToken: Joi.string().required(),
	}),
};

const forgotPassword = {
	body: Joi.object().keys({
		email: Joi.string().email().required(),
	}),
};

const changePassword = {
	body: Joi.object().keys({
		currentPassword: Joi.string().required(),
		newPassword: Joi.string().required(),
	}),
};
const resetPassword = {
	body: Joi.object().keys({
		email: Joi.string().email().required(),
		OTP: Joi.number().required(),
		newPassword: Joi.string().required().custom(password),
	}),
};

const resetPasswordviaEmail = {
	body: Joi.object().keys({
		email: Joi.string().required(),
		newPassword: Joi.string().required().custom(password),
		// oldPassword: Joi.string().required().custom(password),
	}),
};

module.exports = {
	register,
	login,
	logout,
	forgotPassword,
	resetPassword,
	resetPasswordviaEmail,
	updateUser,
	deleteUser,
	getUser,
	changePassword,
	queryUsers,
};
