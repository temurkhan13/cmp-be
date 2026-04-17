const Joi = require("joi");

const exportDocument = {
	body: Joi.object().keys({
		type: Joi.string().valid("pdf", "docx", "xlsx", "pptx").required(),
		source: Joi.string().valid("assessment", "playbook").required(),
		sourceId: Joi.string().uuid().required(),
		options: Joi.object()
			.keys({
				title: Joi.string().allow(""),
				branding: Joi.object().keys({
					accentColor: Joi.string().allow(""),
					logoUrl: Joi.string().allow(""),
				}),
			})
			.optional(),
	}),
};

module.exports = { exportDocument };
