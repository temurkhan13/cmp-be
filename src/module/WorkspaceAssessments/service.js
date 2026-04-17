const { handleStatus, isMarkdownDetected, makeAxiosCall } = require("../../common/global.functions.js");
const config = require("../../config/config.js");
const logger = require("../../config/logger.js");
const supabase = require("../../config/supabase");
const paginate = require("../../utils/paginate");
const axios = require("axios");
const { generateSafePdfFilename } = require("./helper.js");

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
		const hasQA = full.qa && full.qa.length > 0;
		const hasReport = full.report && full.report.isGenerated;
		// If assessment exists but has no Q&A and no report (zombie from failed AI call), retry
		if (!hasQA && !hasReport) {
			logger.info(`Zombie assessment ${existing.id} found — retrying AI call`);
			const { data: bizInfo } = await supabase.from("folder_business_info").select("*").eq("folder_id", folderId).maybeSingle();
			const businessInfoStr = bizInfo
				? `Company: ${bizInfo.company_name || ""}, Size: ${bizInfo.company_size || ""}, Industry: ${bizInfo.industry || ""}, Role: ${bizInfo.job_title || ""}`
				: "";
			const aiPayload = {
				userId, chat_id: folderId, message: body.message || "",
				general_info: body.generalInfo || "", business_info: businessInfoStr || body.business_info || "", assessment_name: name,
			};
			const aiResponse = await requestQuestionOrReportFromAI(aiPayload);
			if (aiResponse.status && aiResponse.data?.message) {
				const aiData = aiResponse.data;
				if (isMarkdownDetected(aiData.message)) {
					await supabase.from("assessment_reports").insert({
						assessment_id: existing.id, is_generated: true,
						title: aiData.title || "Report Title", content: aiData.message,
						generated_at: new Date(),
					});
					await supabase.from("workspace_assessments").update({ status: "completed" }).eq("id", existing.id);
					ingestToRAG(userId, folderId, `assessment-report-${existing.id}`, `Assessment Report: ${name}\n\n${aiData.message}`);
				} else {
					await supabase.from("assessment_qa").insert({
						assessment_id: existing.id, question: aiData.message, status: "pending", asked_at: new Date(),
					});
					await supabase.from("workspace_assessments").update({ status: "in_progress" }).eq("id", existing.id);
				}
				const refreshed = await getWorkspaceAssessmentById(existing.id);
				return { status: true, data: refreshed, message: "Assessment recovered successfully" };
			}
		}
		return { status: true, data: full, message: "Assessment already exists" };
	}

	// Fetch business info BEFORE inserting — fail fast if AI is down
	const { data: bizInfo } = await supabase.from("folder_business_info").select("*").eq("folder_id", folderId).maybeSingle();
	const businessInfoStr = bizInfo
		? `Company: ${bizInfo.company_name || ""}, Size: ${bizInfo.company_size || ""}, Industry: ${bizInfo.industry || ""}, Role: ${bizInfo.job_title || ""}`
		: "";

	const aiPayload = {
		userId, chat_id: folderId, message: body.message || "",
		general_info: body.generalInfo || "", business_info: businessInfoStr || body.business_info || "", assessment_name: name,
	};

	// Call AI FIRST — if it fails, don't create a zombie record
	const aiResponse = await requestQuestionOrReportFromAI(aiPayload);
	if (!aiResponse.status) return handleStatus(false, "AI service unavailable — please try again");

	const { data: aiData } = aiResponse;
	if (!aiData?.message) return handleStatus(false, "AI returned empty response — please try again");

	// AI succeeded — now safe to insert the assessment record
	const { data: assessment, error } = await supabase.from("workspace_assessments").insert({
		user_id: userId, workspace_id: workspaceId, folder_id: folderId, name, status: "pending",
	}).select().single();
	if (error) throw error;

	const shouldGenerateReport = isMarkdownDetected(aiData.message);

	if (shouldGenerateReport) {
		await supabase.from("assessment_reports").insert({
			assessment_id: assessment.id, is_generated: true,
			title: aiData.title || "Report Title", content: aiData.message,
			generated_at: new Date(),
		});
		await supabase.from("workspace_assessments").update({ status: "completed" }).eq("id", assessment.id);
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
	const { data: qa } = await supabase.from("assessment_qa").select("*, reactions:assessment_message_reactions(*)").eq("assessment_id", id).order("created_at");
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

	// Fetch bookmarks
	const { data: bookmarks } = await supabase.from("assessment_bookmarks").select("*").eq("assessment_id", id);
	data.bookmarks = (bookmarks || []).map(b => ({ ...b, _id: b.id, messageId: b.message_id, userId: b.user_id }));
	data._id = data.id;
	data.folderId = data.folder_id;
	data.userId = data.user_id;
	data.workspaceId = data.workspace_id;

	// Fetch media, documents, and links
	const { data: media } = await supabase.from("folder_assessment_media").select("*").eq("assessment_id", id).order("created_at");
	const { data: documents } = await supabase.from("folder_assessment_documents").select("*").eq("assessment_id", id).order("created_at");
	const { data: linkData } = await supabase.from("folder_assessment_links").select("*").eq("assessment_id", id).order("created_at");
	const links = linkData || [];
	data.media = (media || []).map(m => ({ ...m, _id: m.id, fileName: m.file_name }));
	data.documents = (documents || []).map(d => ({ ...d, _id: d.id, fileName: d.file_name }));
	data.links = links.map(l => ({ ...l, _id: l.id }));

	return data;
};

/**
 * Detect and recover zombie assessments (no Q&A, no report).
 * Called from GET endpoint so zombies self-heal when accessed.
 * Returns the healed assessment, or the original if not a zombie or recovery fails.
 */
const recoverZombieIfNeeded = async (assessment) => {
	if (!assessment) return assessment;
	const hasQA = assessment.qa && assessment.qa.length > 0;
	const hasReport = assessment.report && assessment.report.isGenerated;
	if (hasQA || hasReport) return assessment; // Not a zombie

	logger.info(`Zombie assessment ${assessment.id} detected on GET — recovering`);
	try {
		const { data: bizInfo } = await supabase.from("folder_business_info").select("*").eq("folder_id", assessment.folder_id).maybeSingle();
		const businessInfoStr = bizInfo
			? `Company: ${bizInfo.company_name || ""}, Size: ${bizInfo.company_size || ""}, Industry: ${bizInfo.industry || ""}, Role: ${bizInfo.job_title || ""}`
			: "";
		const aiPayload = {
			userId: assessment.user_id, chat_id: assessment.folder_id, message: "",
			general_info: "", business_info: businessInfoStr, assessment_name: assessment.name,
		};
		const aiResponse = await requestQuestionOrReportFromAI(aiPayload);
		if (!aiResponse.status || !aiResponse.data?.message) {
			logger.warn(`Zombie recovery failed for ${assessment.id} — AI unavailable`);
			return assessment;
		}
		const aiData = aiResponse.data;
		if (isMarkdownDetected(aiData.message)) {
			await supabase.from("assessment_reports").insert({
				assessment_id: assessment.id, is_generated: true,
				title: aiData.title || "Report Title", content: aiData.message,
				generated_at: new Date(),
			});
			await supabase.from("workspace_assessments").update({ status: "completed" }).eq("id", assessment.id);
		} else {
			await supabase.from("assessment_qa").insert({
				assessment_id: assessment.id, question: aiData.message, status: "pending", asked_at: new Date(),
			});
			await supabase.from("workspace_assessments").update({ status: "in_progress" }).eq("id", assessment.id);
		}
		logger.info(`Zombie assessment ${assessment.id} recovered successfully`);
		return await getWorkspaceAssessmentById(assessment.id);
	} catch (e) {
		logger.error(`Zombie recovery error for ${assessment.id}: ${e.message}`);
		return assessment;
	}
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

	// Clean up media, documents, and links (no FK cascade since constraint was dropped)
	await supabase.from("folder_assessment_media").delete().eq("assessment_id", id);
	await supabase.from("folder_assessment_documents").delete().eq("assessment_id", id);
	await supabase.from("folder_assessment_links").delete().eq("assessment_id", id);

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

	// Parse file content if a file was uploaded (for AI context)
	let answerForAI = answer || "";
	if (body.fileBuffer) {
		let fileText = "";
		const ext = (body.fileOriginalName || "").split(".").pop().toLowerCase();
		try {
			if (ext === "pdf") {
				const pdfParse = require("pdf-parse");
				fileText = (await pdfParse(body.fileBuffer)).text || "";
			} else if (ext === "docx") {
				const mammoth = require("mammoth");
				fileText = (await mammoth.extractRawText({ buffer: body.fileBuffer })).value || "";
			} else {
				fileText = body.fileBuffer.toString("utf-8");
			}
			if (fileText.length > 30000) fileText = fileText.substring(0, 30000) + "\n[...truncated...]";
		} catch (e) { console.error("Assessment file parse error:", e.message); }
		if (fileText) answerForAI = `${answerForAI}\n\n[Attached Document Content]:\n${fileText}`;
	}

	// Build history BEFORE marking answered (include this answer in history for AI)
	const { data: qaHistory } = await supabase.from("assessment_qa").select().eq("assessment_id", workspaceAssessmentId).order("created_at");
	const history = ["", ...(qaHistory || []).flatMap((q) => [q.question, q.answer || ""]), answerForAI];

	// Fetch business info for AI context
	const { data: bizInfo } = await supabase.from("folder_business_info").select("*").eq("folder_id", assessment.folder_id).maybeSingle();
	const businessInfoStr = bizInfo
		? `Company: ${bizInfo.company_name || ""}, Size: ${bizInfo.company_size || ""}, Industry: ${bizInfo.industry || ""}, Role: ${bizInfo.job_title || ""}`
		: "";

	// Fetch completed assessments in same folder for cross-assessment context
	let priorAssessmentContext = "";
	try {
		const { data: otherAssessments } = await supabase
			.from("workspace_assessments")
			.select("id, name, status")
			.eq("folder_id", assessment.folder_id)
			.eq("status", "completed")
			.neq("id", workspaceAssessmentId)
			.limit(5);
		if (otherAssessments && otherAssessments.length > 0) {
			const summaries = [];
			for (const oa of otherAssessments) {
				const { data: report } = await supabase
					.from("assessment_reports")
					.select("content")
					.eq("assessment_id", oa.id)
					.maybeSingle();
				if (report?.content) {
					summaries.push(`[${oa.name}]: ${report.content.substring(0, 500)}`);
				}
			}
			if (summaries.length > 0) {
				priorAssessmentContext = "Context from prior completed assessments:\n" + summaries.join("\n\n");
			}
		}
	} catch (e) {
		logger.info("Prior assessment context fetch skipped:", e.message);
	}

	const aiPayload = {
		userId: assessment.user_id, chat_id: assessment.folder_id, message: answerForAI,
		history, general_info: priorAssessmentContext, business_info: businessInfoStr, assessment_name: assessment.name,
	};

	// Call AI FIRST — if it fails, don't mark question as answered (user can retry)
	const aiResponse = await requestQuestionOrReportFromAI(aiPayload);
	if (!aiResponse.status) return handleStatus(false, "AI service unavailable — your answer was not saved, please try again");

	const { data: aiData } = aiResponse;
	if (!aiData?.message) return handleStatus(false, "AI returned empty response — your answer was not saved, please try again");

	// AI succeeded — now safe to mark question as answered
	await supabase.from("assessment_qa").update({
		answer, status: "answered", answered_at: new Date(),
	}).eq("id", questionId);

	// Store media/document records if file was uploaded
	if (body.media && body.media.length > 0) {
		const mediaRows = body.media.map((m) => ({
			assessment_id: workspaceAssessmentId,
			file_name: m.fileName, url: m.url,
		}));
		await supabase.from("folder_assessment_media").insert(mediaRows);
	}
	if (body.documents && body.documents.length > 0) {
		const docRows = body.documents.map((d) => ({
			assessment_id: workspaceAssessmentId,
			file_name: d.fileName, name: d.name,
			url: body.fileUrl || null,
			date: d.date || null, size: d.size ? String(d.size) : null,
		}));
		await supabase.from("folder_assessment_documents").insert(docRows);
	}

	// Extract and store links from answer text
	if (answer) {
		const urlRegex = /https?:\/\/[^\s<>"')\]]+/gi;
		const foundUrls = (answer || "").match(urlRegex);
		if (foundUrls && foundUrls.length > 0) {
			const linkRows = foundUrls.map((url) => {
				try { return { assessment_id: workspaceAssessmentId, name: new URL(url).hostname, url }; }
				catch { return { assessment_id: workspaceAssessmentId, name: url, url }; }
			});
			await supabase.from("folder_assessment_links").insert(linkRows);
		}
	}

	// RAG: ingest the Q&A pair (best-effort)
	ingestToRAG(
		assessment.user_id, assessment.folder_id,
		`assessment-qa-${workspaceAssessmentId}-${questionId}`,
		`Assessment: ${assessment.name}\nQ: ${question.question}\nA: ${answer}`
	);

	if (isMarkdownDetected(aiData.message)) {
		await supabase.from("assessment_reports").upsert({
			assessment_id: workspaceAssessmentId, is_generated: true,
			title: aiData.title || "Report Title", content: aiData.message,
			generated_at: new Date(),
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
		update.content = content;
	}

	const { data: report } = await supabase.from("assessment_reports").update(update).eq("assessment_id", workspaceAssessmentId).select().single();
	await supabase.from("workspace_assessments").update({ status: "completed" }).eq("id", workspaceAssessmentId);

	return { status: true, data: report, message: "Report updated successfully" };
};

const downloadAssessmentReport = async (workspaceAssessmentId) => {
	const assessment = await getWorkspaceAssessmentById(workspaceAssessmentId);
	if (!assessment) return handleStatus(false, "Workspace assessment not found!");
	if (!assessment.report?.content) return handleStatus(false, "Report not found!");

	const { convertMarkdownToPDF } = require("../../utils/markdownToPDF");
	const buffer = await convertMarkdownToPDF(assessment.report.content);
	const fileName = generateSafePdfFilename(assessment.report.title || "assessment-report");

	return { status: true, data: { fileName, buffer } };
};

module.exports = {
	createWorkspaceAssessment,
	queryWorkspaceAssessments,
	getWorkspaceAssessmentById,
	recoverZombieIfNeeded,
	updateWorkspaceAssessmentById,
	deleteWorkspaceAssessmentById,
	updateAssessmentAnswer,
	updateAssessmentReport,
	downloadAssessmentReport,
};
