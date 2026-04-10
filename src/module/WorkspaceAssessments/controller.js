const httpStatus = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const ApiError = require("../../utils/ApiError");
const pick = require("../../utils/pick");
const workspaceAssessmentService = require("./service");

const createWorkspaceAssessment = catchAsync(async (req, res) => {
	const workspaceAssessment = await workspaceAssessmentService.createWorkspaceAssessment(req.body);
	res.status(httpStatus.CREATED).send(workspaceAssessment);
});
const getWorkspaceAssessments = catchAsync(async (req, res) => {
	const filter = pick(req.query, ["folderId", "name", "status"]);
	const options = pick(req.query, ["sortBy", "limit", "page"]);
	const result = await workspaceAssessmentService.queryWorkspaceAssessments(filter, options);
	res.send(result);
});
const getWorkspaceAssessment = catchAsync(async (req, res) => {
	let workspaceAssessment = await workspaceAssessmentService.getWorkspaceAssessmentById(req.params.workspaceAssessmentId);
	if (!workspaceAssessment) {
		throw new ApiError(httpStatus.NOT_FOUND, "Workspace assessment not found");
	}
	// Self-heal zombie assessments (created during AI outage with no Q&A/report)
	workspaceAssessment = await workspaceAssessmentService.recoverZombieIfNeeded(workspaceAssessment);
	res.send(workspaceAssessment);
});
const updateWorkspaceAssessment = catchAsync(async (req, res) => {
	const workspaceAssessment = await workspaceAssessmentService.updateWorkspaceAssessmentById(
		req.params.workspaceAssessmentId,
		req.body,
	);

	if (!workspaceAssessment) {
		throw new ApiError(httpStatus.NOT_FOUND, workspaceAssessment.message);
	}
	res.send(workspaceAssessment);
});
const deleteWorkspaceAssessment = catchAsync(async (req, res) => {
	const workspaceAssessment = await workspaceAssessmentService.deleteWorkspaceAssessmentById(
		req.params.workspaceAssessmentId,
	);

	if (!workspaceAssessment) {
		throw new ApiError(httpStatus.NOT_FOUND, workspaceAssessment.message);
	}
	res.status(httpStatus.NO_CONTENT).send();
});
const updateAssessmentAnswer = catchAsync(async (req, res) => {
	const workspaceAssessment = await workspaceAssessmentService.updateAssessmentAnswer(
		req.params.workspaceAssessmentId,
		req.body,
	);

	if (!workspaceAssessment) {
		throw new ApiError(httpStatus.NOT_FOUND, workspaceAssessment.message);
	}
	res.send(workspaceAssessment);
});
const updateAssessmentReport = catchAsync(async (req, res) => {
	const workspaceAssessment = await workspaceAssessmentService.updateAssessmentReport(
		req.params.workspaceAssessmentId,
		req.body,
	);
	if (!workspaceAssessment.status) {
		throw new ApiError(httpStatus.NOT_FOUND, workspaceAssessment.message);
	}
	res.send(workspaceAssessment);
});
const downloadAssessmentReport = catchAsync(async (req, res) => {
	const {
		params: { workspaceAssessmentId },
	} = req;
	const workspaceAssessment = await workspaceAssessmentService.downloadAssessmentReport(workspaceAssessmentId);
	if (!workspaceAssessment.status) {
		throw new ApiError(httpStatus.NOT_FOUND, workspaceAssessment.message);
	}

	res.redirect(workspaceAssessment.data.downloadUrl);
});

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
