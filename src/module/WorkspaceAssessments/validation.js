const Joi = require("joi");
const { objectId } = require("../../utils/custom.validation");

const createWorkspaceAssessment = {
	body: Joi.object().keys({
		folderId: Joi.string().custom(objectId),
		name: Joi.string().required(),
	}),
};
const getWorkspaceAssessments = {
	query: Joi.object().keys({
		folderId: Joi.string().custom(objectId),
		name: Joi.string(),
		status: Joi.string(),
	}),
};
const getWorkspaceAssessment = {
	params: Joi.object().keys({
		workspaceAssessmentId: Joi.string().custom(objectId),
	}),
};
const updateWorkspaceAssessment = {
	params: Joi.object().keys({
		workspaceAssessmentId: Joi.required().custom(objectId),
	}),
	body: Joi.object().keys({
		qa: Joi.array().items(
			Joi.object().keys({
				question: Joi.string(),
				answer: Joi.string(),
			}),
		),
	}),
};
const deleteWorkspaceAssessment = {
	params: Joi.object().keys({
		workspaceAssessmentId: Joi.string().custom(objectId),
	}),
};
const updateAssessmentAnswer = {
	params: Joi.object().keys({
		workspaceAssessmentId: Joi.string().custom(objectId),
	}),
	body: Joi.object().keys({
		questionId: Joi.string().custom(objectId),
		answer: Joi.string(),
	}),
};
const updateAssessmentReport = {
	params: Joi.object().keys({
		workspaceAssessmentId: Joi.string().custom(objectId),
	}),
	body: Joi.object()
		.keys({
			title: Joi.string(),
			content: Joi.string(),
		})
		.min(1),
};
const downloadAssessmentReport = {
	params: Joi.object().keys({
		workspaceAssessmentId: Joi.string().custom(objectId),
	}),
};

module.exports = {
	createWorkspaceAssessment,
	getWorkspaceAssessments,
	getWorkspaceAssessment,
	updateWorkspaceAssessment,
	deleteWorkspaceAssessment,
	updateAssessmentAnswer,
	updateAssessmentReport,
	downloadAssessmentReport,
};
