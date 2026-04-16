const express = require("express");
const controller = require("./controller");
const validation = require("./validation");
const validate = require("../../middlewares/validate");
const auth = require("../../middlewares/auth");
const { pdfHeaderMiddleware } = require("../../middlewares/pdfHeaderMiddleware");
const { fileUpload } = require("../../utils/fileUpload");

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
	fileUpload.single("file"),
	validate(validation.updateAssessmentAnswer),
	controller.updateAssessmentAnswer,
);
router.patch(
	"/:workspaceAssessmentId/report",
	auth(),
	validate(validation.updateAssessmentReport),
	controller.updateAssessmentReport,
);
router.get(
	"/:workspaceAssessmentId/report/download",
	[auth(), pdfHeaderMiddleware],
	validate(validation.downloadAssessmentReport),
	controller.downloadAssessmentReport,
);

module.exports = {
	workspaceAssessments: router,
};
