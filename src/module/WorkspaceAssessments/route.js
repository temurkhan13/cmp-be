const express = require("express");
const controller = require("./controller");
const validation = require("./validation");
const validate = require("../../middlewares/validate");
const auth = require("../../middlewares/auth");

const router = express.Router();

router
	.route("/")
	.post(auth(), validate(validation.createWorkspaceAssessment), controller.createWorkspaceAssessment)
	.get(auth(), validate(validation.getWorkspaceAssessments), controller.getWorkspaceAssessments);

router
	.route("/:workspaceAssessmentId")
	.get(auth(), validate(validation.getWorkspaceAssessment), controller.getWorkspaceAssessment)
	.patch(auth(), validate(validation.updateWorkspaceAssessment), controller.updateWorkspaceAssessment)
	.delete(auth(), validate(validation.deleteWorkspaceAssessment), controller.deleteWorkspaceAssessment);

router.patch(
	"/:workspaceAssessmentId/answer",
	auth(),
	validate(validation.updateAssessmentAnswer),
	controller.updateAssessmentAnswer,
);

module.exports = {
	workspaceAssessments: router,
};
