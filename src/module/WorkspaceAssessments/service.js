const { handleStatus, isMarkdownDetected, makeAxiosCall } = require("../../common/global.functions.js");
const config = require("../../config/config.js");
const logger = require("../../config/logger.js");
const supabase = require("../../config/supabase");
const paginate = require("../../utils/paginate");
const axios = require("axios");
const { generateAndConvertMarkdownToPDF, removeStorageFile, generateSafePdfFilename } = require("./helper.js");

// RAG ingest helper — best-effort, never blocks the main flow
const ingestToRAG = async (userId, folderId, filename, content) => {
	try {
		await axios.post(`${config.baseUrl}/ingest`, {
			user_id: String(userId),
			workspace_id: "",
			folder_id: String(folderId),
			filename,
			content,
		});
		logger.info(`RAG ingested: ${filename}`);
	} catch (e) {
		logger.info(`RAG ingest skipped: ${e.message}`);
	}
};

const createWorkspaceAssessment = async (body) => {
	const { folderId, name } = body;

	const { data: folder } = await supabase.from("folders").select("id, workspace_id, workspaces(user_id)").eq("id", folderId).single();
	if (!folder) return handleStatus(false, "Workspace folder not found");

	const userId = folder.workspaces?.user_id;
	const workspaceId = folder.workspace_id;

	// Check for duplicate assessment (same folder + name)
	const { data: existing } = await supabase.from("workspace_assessments")
		.select("id").eq("folder_id", folderId).eq("name", name).maybeSingle();
	if (existing) {
		const full = await getWorkspaceAssessmentById(existing.id);
		return { status: true, data: full, message: "Assessment already exists" };
	}

	const { data: assessment, error } = await supabase.from("workspace_assessments").insert({
		user_id: userId, workspace_id: workspaceId, folder_id: folderId, name, status: "pending",
	}).select().single();
	if (error) throw error;

	// Fetch business info from folder for AI context
	const { data: bizInfo } = await supabase.from("folder_business_info").select("*").eq("folder_id", folderId).maybeSingle();
	const businessInfoStr = bizInfo
		? `Company: ${bizInfo.company_name || ""}, Size: ${bizInfo.company_size || ""}, Industry: ${bizInfo.industry || ""}, Role: ${bizInfo.job_title || ""}`
		: "";

	const aiPayload = {
		userId, chat_id: folderId, message: body.message || "",
		general_info: body.generalInfo || "", business_info: businessInfoStr || body.business_info || "", assessment_name: name,
	};
	const aiResponse = await requestQuestionOrReportFromAI(aiPayload);
	if (!aiResponse.status) return handleStatus(false, aiResponse.message);

	const { data: aiData } = aiResponse;
	if (!aiData?.message) return handleStatus(false, "No message found in AI response");

	const shouldGenerateReport = isMarkdownDetected(aiData.message);

	if (shouldGenerateReport) {
		const pdf = await generateAndConvertMarkdownToPDF(aiData.message);
		await supabase.from("assessment_reports").insert({
			assessment_id: assessment.id, is_generated: true,
			title: aiData.title || "Report Title", content: aiData.message,
			url: pdf.publicUrl, storage_path: pdf.storagePath, generated_at: new Date(),
		});
		await supabase.from("workspace_assessments").update({ status: "completed" }).eq("id", assessment.id);
		// RAG: ingest report
		ingestToRAG(userId, folderId, `assessment-report-${assessment.id}`, `Assessment Report: ${name}\n\n${aiData.message}`);
	} else {
		await supabase.from("assessment_qa").insert({
			assessment_id: assessment.id, question: aiData.message, status: "pending", asked_at: new Date(),
		});
		await supabase.from("workspace_assessments").update({ status: "in_progress" }).eq("id", assessment.id);
	}

	const full = await getWorkspaceAssessmentById(assessment.id);
	return { status: true, data: full, message: "Workspace assessment created successfully" };
};

const queryWorkspaceAssessments = async (filter, options) => {
	const mapped = {};
	if (filter.folderId) mapped.folder_id = filter.folderId;
	if (filter.userId) mapped.user_id = filter.userId;
	if (filter.workspaceId) mapped.workspace_id = filter.workspaceId;
	return paginate("workspace_assessments", { filter: mapped, ...options }, supabase);
};

const getWorkspaceAssessmentById = async (id) => {
	const { data } = await supabase.from("workspace_assessments").select().eq("id", id).single();
	if (!data) return null;

	const { data: report } = await supabase.from("assessment_reports").select().eq("assessment_id", id).single();
	const { data: qa } = await supabase.from("assessment_qa").select().eq("assessment_id", id).order("created_at");
	if (report) {
		data.report = {
			...report, _id: report.id,
			isGenerated: report.is_generated,
			assessmentId: report.assessment_id,
			storagePath: report.storage_path,
			generatedAt: report.generated_at,
			ReportTitle: report.title,
		};
	} else {
		data.report = null;
	}
	data.qa = (qa || []).map(q => ({ ...q, _id: q.id, assessmentId: q.assessment_id, askedAt: q.asked_at, answeredAt: q.answered_at }));
	data._id = data.id;
	data.folderId = data.folder_id;
	data.userId = data.user_id;
	data.workspaceId = data.workspace_id;
	return data;
};

const updateWorkspaceAssessmentById = async (id, body) => {
	const existing = await getWorkspaceAssessmentById(id);
	if (!existing) return handleStatus(false, "Workspace assessment not found");

	const update = {};
	if (body.name !== undefined) update.name = body.name;
	if (body.status !== undefined) update.status = body.status;

	const { data, error } = await supabase.from("workspace_assessments").update(update).eq("id", id).select().single();
	if (error) throw error;
	return data;
};

const deleteWorkspaceAssessmentById = async (id) => {
	const existing = await getWorkspaceAssessmentById(id);
	if (!existing) return handleStatus(false, "Workspace assessment not found");

	if (existing.report?.storage_path) {
		await removeStorageFile(existing.report.storage_path);
	}

	await supabase.from("workspace_assessments").delete().eq("id", id);
};

const requestQuestionOrReportFromAI = async (data) => {
	try {
		const gptURL = config.baseUrl + "/assesment-chat";
		const gptResponse = await makeAxiosCall({ url: gptURL, method: "POST", data });
		return { status: true, data: gptResponse };
	} catch (error) {
		logger.error("Error while getting question/report from AI:", error);
		return { status: false, message: "Error while getting question/report from AI" };
	}
};

const updateAssessmentAnswer = async (workspaceAssessmentId, body) => {
	const assessment = await getWorkspaceAssessmentById(workspaceAssessmentId);
	if (!assessment) return handleStatus(false, "Workspace assessment not found");

	const { questionId, answer } = body;
	const question = (assessment.qa || []).find((q) => q.id === questionId);
	if (!question) return handleStatus(false, "Question not found");
	if (question.status !== "pending") return handleStatus(false, "Question already answered");

	await supabase.from("assessment_qa").update({
		answer, status: "answered", answered_at: new Date(),
	}).eq("id", questionId);

	// RAG: ingest the Q&A pair
	ingestToRAG(
		assessment.user_id, assessment.folder_id,
		`assessment-qa-${workspaceAssessmentId}-${questionId}`,
		`Assessment: ${assessment.name}\nQ: ${question.question}\nA: ${answer}`
	);

	const { data: qaHistory } = await supabase.from("assessment_qa").select().eq("assessment_id", workspaceAssessmentId).order("created_at");
	const history = ["", ...(qaHistory || []).flatMap((q) => [q.question, q.answer])];

	// Fetch business info for AI context
	const { data: bizInfo } = await supabase.from("folder_business_info").select("*").eq("folder_id", assessment.folder_id).maybeSingle();
	const businessInfoStr = bizInfo
		? `Company: ${bizInfo.company_name || ""}, Size: ${bizInfo.company_size || ""}, Industry: ${bizInfo.industry || ""}, Role: ${bizInfo.job_title || ""}`
		: "";

	const aiPayload = {
		userId: assessment.user_id, chat_id: assessment.folder_id, message: answer || "",
		history, general_info: "", business_info: businessInfoStr, assessment_name: assessment.name,
	};
	const aiResponse = await requestQuestionOrReportFromAI(aiPayload);
	if (!aiResponse.status) return handleStatus(false, aiResponse.message);

	const { data: aiData } = aiResponse;
	if (!aiData?.message) return handleStatus(false, "No message found in AI response");

	if (isMarkdownDetected(aiData.message)) {
		const pdf = await generateAndConvertMarkdownToPDF(aiData.message);

		if (assessment.report?.storage_path) {
			await removeStorageFile(assessment.report.storage_path);
		}

		await supabase.from("assessment_reports").upsert({
			assessment_id: workspaceAssessmentId, is_generated: true,
			title: aiData.title || "Report Title", content: aiData.message,
			url: pdf.publicUrl, storage_path: pdf.storagePath, generated_at: new Date(),
		});
		await supabase.from("workspace_assessments").update({ status: "completed" }).eq("id", workspaceAssessmentId);

		// RAG: ingest the full report
		ingestToRAG(
			assessment.user_id, assessment.folder_id,
			`assessment-report-${workspaceAssessmentId}`,
			`Assessment Report: ${assessment.name}\n\n${aiData.message}`
		);
	} else {
		await supabase.from("assessment_qa").insert({
			assessment_id: workspaceAssessmentId, question: aiData.message, status: "pending", asked_at: new Date(),
		});
	}

	const full = await getWorkspaceAssessmentById(workspaceAssessmentId);
	return { status: true, data: full, message: "Answer updated successfully" };
};

const updateAssessmentReport = async (workspaceAssessmentId, body) => {
	const assessment = await getWorkspaceAssessmentById(workspaceAssessmentId);
	if (!assessment) return handleStatus(false, "Workspace assessment not found!");

	const { title, content } = body;
	const update = {};
	if (title) update.title = title;

	if (content) {
		const pdf = await generateAndConvertMarkdownToPDF(content);
		if (pdf) {
			if (assessment.report?.storage_path) {
				await removeStorageFile(assessment.report.storage_path);
			}
			update.url = pdf.publicUrl;
			update.storage_path = pdf.storagePath;
			update.content = content;
		}
	}

	const { data: report } = await supabase.from("assessment_reports").update(update).eq("assessment_id", workspaceAssessmentId).select().single();
	await supabase.from("workspace_assessments").update({ status: "completed" }).eq("id", workspaceAssessmentId);

	return { status: true, data: report, message: "Report updated successfully" };
};

const downloadAssessmentReport = async (workspaceAssessmentId) => {
	const assessment = await getWorkspaceAssessmentById(workspaceAssessmentId);
	if (!assessment) return handleStatus(false, "Workspace assessment not found!");
	if (!assessment.report?.url) return handleStatus(false, "Report not found!");

	const fileName = generateSafePdfFilename(assessment.report.title || "assessment-report");
	if (!fileName) return handleStatus(false, "Error generating file name");

	return { status: true, data: { fileName, downloadUrl: assessment.report.url } };
};

module.exports = {
	createWorkspaceAssessment,
	queryWorkspaceAssessments,
	getWorkspaceAssessmentById,
	updateWorkspaceAssessmentById,
	deleteWorkspaceAssessmentById,
	updateAssessmentAnswer,
	updateAssessmentReport,
	downloadAssessmentReport,
};
