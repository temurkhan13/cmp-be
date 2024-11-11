const { handleStatus, isMarkdownDetected, makeAxiosCall } = require("../../common/global.functions.js");
const schema = require("../../common/schema.js");
const config = require("../../config/config.js");
const logger = require("../../config/logger.js");
const Workspace = require("../workSpaces/entity/modal.js");
const WorkspaceAssessment = require("./entity/model.js");
const { generateAndConvertMarkdownToPDF } = require("./helper.js");

const createWorkspaceAssessment = async (body) => {
	const { folderId, name } = body;

	const workspaceFolder = await Workspace.findOne({ "folders._id": folderId });
	if (!workspaceFolder) {
		handleStatus(false, "Workspace folder not found");
	}
	const { _id: workspaceId, userId } = workspaceFolder;

	const workspaceAssessment = new WorkspaceAssessment({ userId, workspaceId, folderId, name });
	await workspaceAssessment.save();

	const aiPayload = {
		userId,
		chat_id: folderId,
		message: body.message || "",
		general_info: body.generalInfo || "",
		business_info: body.business_info || "",
		assessment_name: name,
	};
	const aiResponse = await requestQuestionOrReportFromAI(aiPayload);
	if (!aiResponse.status) {
		return handleStatus(false, aiResponse.message);
	}

	const { data } = aiResponse;
	if (!data?.message) {
		return handleStatus(false, "No message found in AI response");
	}

	const shouldGenerateReport = isMarkdownDetected(data.message);

	if (shouldGenerateReport) {
		const pdf = generateAndConvertMarkdownToPDF(data.message);

		workspaceAssessment.report = {
			isGenerated: true,
			title: data.title || "Report Title",
			content: data.message,
			url: `/uploads/${pdf.fileName}`,
			generatedAt: new Date(),
		};
		workspaceAssessment.status = schema.workspaceAssessment.enums.assessmentStatus.COMPLETED;
	} else {
		workspaceAssessment.qa.push({
			question: data.message,
			status: "pending",
			askedAt: new Date(),
		});
		workspaceAssessment.status = schema.workspaceAssessment.enums.assessmentStatus.IN_PROGRESS;
	}

	await workspaceAssessment.save();

	return {
		status: true,
		data: workspaceAssessment,
		message: "Workspace assessment created successfully",
	};
};
const queryWorkspaceAssessments = async (filter, options) => {
	const workspaceAssessments = await WorkspaceAssessment.paginate(filter, options);
	return workspaceAssessments;
};
const getWorkspaceAssessmentById = async (id) => {
	const workspaceAssessment = await WorkspaceAssessment.findById(id);
	return workspaceAssessment;
};
const updateWorkspaceAssessmentById = async (id, body) => {
	const workspaceAssessment = await getWorkspaceAssessmentById(id);
	if (!workspaceAssessment) {
		handleStatus(false, "Workspace assessment not found");
	}
	Object.assign(workspaceAssessment, body);
	await workspaceAssessment.save();
	return workspaceAssessment;
};
const deleteWorkspaceAssessmentById = async (id) => {
	const workspaceAssessment = await getWorkspaceAssessmentById(id);
	if (!workspaceAssessment) {
		handleStatus(false, "Workspace assessment not found");
	}
	await workspaceAssessment.remove();
};
const requestQuestionOrReportFromAI = async (data) => {
	try {
		const gptURL = `${config.baseUrl}/assesment-chat`;
		const gptResponse = await makeAxiosCall({ url: gptURL, method: "POST", data });
		return {
			status: true,
			data: gptResponse,
		};
	} catch (error) {
		logger.error("Error while getting question/report from AI:", error);
		return {
			status: false,
			message: "Error while getting question/report from AI",
		};
	}
};
const updateAssessmentAnswer = async (workspaceAssessmentId, body) => {
	const workspaceAssessment = await getWorkspaceAssessmentById(workspaceAssessmentId);
	if (!workspaceAssessment) {
		handleStatus(false, "Workspace assessment not found");
	}

	const workspaceFolder = await Workspace.findOne({
		_id: workspaceAssessment.workspaceId,
		"folders._id": workspaceAssessment.folderId,
	});
	if (!workspaceFolder) {
		handleStatus(false, "Workspace folder not found");
	}

	const { questionId, answer } = body;

	const question = workspaceAssessment.qa.id(questionId);
	if (!question) {
		return handleStatus(false, "Question not found");
	}

	if (question.status !== "pending") {
		return handleStatus(false, "Question already answered");
	}

	question.answer = answer;
	question.status = "answered";
	question.answeredAt = new Date();
	const updatedAssessment = await workspaceAssessment.save();
	const { userId, folderId, qa, name } = updatedAssessment;

	const qaHistory = ["", ...qa.flatMap((q) => [q.question, q.answer])];

	const aiPayload = {
		userId,
		chat_id: folderId,
		message: answer || "",
		history: qaHistory,
		general_info: workspaceFolder.surveyInfo || "",
		business_info: workspaceFolder.businessInfo || "",
		assessment_name: name,
	};
	const aiResponse = await requestQuestionOrReportFromAI(aiPayload);
	if (!aiResponse.status) {
		return handleStatus(false, aiResponse.message);
	}

	const { data } = aiResponse;
	if (!data?.message) {
		return handleStatus(false, "No message found in AI response");
	}

	const shouldGenerateReport = isMarkdownDetected(data.message);

	if (shouldGenerateReport) {
		const pdf = generateAndConvertMarkdownToPDF(data.message);

		updatedAssessment.report = {
			isGenerated: true,
			title: data.title || "Report Title",
			content: data.message,
			url: `/uploads/${pdf.fileName}`,
			generatedAt: new Date(),
		};
		updatedAssessment.status = schema.workspaceAssessment.enums.assessmentStatus.COMPLETED;
	} else {
		updatedAssessment.qa.push({
			question: data.message,
			status: "pending",
			askedAt: new Date(),
		});
	}

	await updatedAssessment.save();

	return {
		status: true,
		data: updatedAssessment,
		message: "Answer updated successfully",
	};
};

module.exports = {
	createWorkspaceAssessment,
	queryWorkspaceAssessments,
	getWorkspaceAssessmentById,
	updateWorkspaceAssessmentById,
	deleteWorkspaceAssessmentById,
	updateAssessmentAnswer,
};
