const httpStatus = require("http-status");
const ApiError = require("../../utils/ApiError");
const config = require("../../config/config");
const { default: axios } = require("axios");
const supabase = require("../../config/supabase");

const createAssessment = async (body) => {
	const { messages, user, generalInfo, bussinessInfo, assessmentName } = body;

	// Create assessment
	const { data: assessment, error } = await supabase.from("assessments").insert({ user_id: user }).select().single();
	if (error) throw error;

	// Insert initial messages
	if (messages && messages.length > 0) {
		const msgs = messages.map((m) => ({
			assessment_id: assessment.id,
			text: m.text || null,
			sender_id: m.sender || user,
			pdf_path: m.pdfPath || null,
			general_info: m.generalInfo || null,
			survey_type: m.surType || null,
			assessment_name: m.assessmentName || null,
			check_type: m.checkType || null,
		}));
		await supabase.from("assessment_messages").insert(msgs);
	}

	try {
		const message = messages[0];
		const { data: allMsgs } = await supabase.from("assessment_messages").select("text").eq("assessment_id", assessment.id);
		const textMessages = (allMsgs || []).filter((m) => m.text).map((m) => m.text);

		const gptResponse = await axios.post(`${config.baseUrl}/assesment-chat`, {
			user_id: user,
			chat_id: assessment.id,
			message: message.text,
			history: textMessages,
			general_info: generalInfo,
			bussiness_info: bussinessInfo,
			assessment_name: assessmentName,
		});

		// Add AI response
		await supabase.from("assessment_messages").insert({
			assessment_id: assessment.id,
			text: gptResponse.data.message,
		});

		// Return full assessment with messages
		const { data: fullAssessment } = await supabase.from("assessments").select().eq("id", assessment.id).single();
		const { data: finalMsgs } = await supabase.from("assessment_messages").select().eq("assessment_id", assessment.id).order("created_at");
		fullAssessment.messages = finalMsgs || [];
		return fullAssessment;
	} catch (err) {
		console.error("Failed to send data to AI server:", err.message);
		throw new Error("AI server error");
	}
};

const createSurvey = async (message, generalInfo, surveyType) => {
	const { data: survey, error } = await supabase.from("assessments").insert({ user_id: message.user }).select().single();
	if (error) throw error;

	if (message.messages) {
		const msgs = message.messages.map((m) => ({
			assessment_id: survey.id,
			text: m.text || null,
			sender_id: m.sender || message.user,
		}));
		await supabase.from("assessment_messages").insert(msgs);
	}

	try {
		const gptResponse = await axios.post(`${config.baseUrl}/survey-chat`, {
			user_id: message.user,
			chat_id: survey.id,
			message: message.messages?.[0]?.text || "",
			history: [],
			general_info: generalInfo,
			survey_type: surveyType,
		});
		return gptResponse.data;
	} catch (err) {
		console.error("Failed to send data to AI server:", err.message);
		throw new Error("AI server error");
	}
};

const get = async (id) => {
	const { data: doc } = await supabase.from("assessments").select().eq("id", id).single();
	if (!doc) {
		throw new ApiError(httpStatus.NOT_FOUND, "Assessment not found");
	}
	const { data: msgs } = await supabase.from("assessment_messages").select().eq("assessment_id", id).order("created_at");
	doc.messages = msgs || [];
	return doc;
};

const updateAssessment = async (id, updateBody) => {
	const { messages, user, generalInfo, bussinessInfo, assessmentName } = updateBody;

	// Insert user message
	if (messages && messages.length > 0) {
		const msgs = messages.map((m) => ({
			assessment_id: id,
			text: m.text || null,
			sender_id: m.sender || user,
		}));
		await supabase.from("assessment_messages").insert(msgs);
	}

	await supabase.from("assessments").update({ user_id: user }).eq("id", id);

	const { data: allMsgs } = await supabase.from("assessment_messages").select("text").eq("assessment_id", id).order("created_at");
	const textMessages = ["", ...(allMsgs || []).filter((m) => m.text).map((m) => m.text)];

	try {
		const gptResponse = await axios.post(`${config.baseUrl}/assesment-chat`, {
			user_id: user,
			chat_id: id,
			message: messages[0].text,
			history: textMessages,
			general_info: generalInfo,
			bussiness_info: bussinessInfo,
			assessment_name: assessmentName,
		});

		const gptMessage = { text: gptResponse.data.message };
		await supabase.from("assessment_messages").insert({ assessment_id: id, text: gptMessage.text });
		return gptMessage;
	} catch (err) {
		console.error("Failed to send data to AI server:", err.message);
		throw new Error("AI server error");
	}
};

const updateSurvey = async (id, message, userId) => {
	await supabase.from("assessment_messages").insert({
		assessment_id: id,
		text: message.text || null,
		sender_id: userId,
	});
	await supabase.from("assessments").update({ user_id: userId }).eq("id", id);

	const { data: allMsgs } = await supabase.from("assessment_messages").select("text").eq("assessment_id", id).order("created_at");
	const textMessages = (allMsgs || []).filter((m) => m.text).map((m) => m.text);

	try {
		const gptResponse = await axios.post(`${config.baseUrl}/assesment-chat`, {
			user_id: userId,
			chat_id: id,
			message: message.text,
			history: textMessages,
			general_info: message.generalInfo,
			survey_type: message.surType,
		});

		await supabase.from("assessment_messages").insert({ assessment_id: id, text: gptResponse.data });

		const full = await get(id);
		return full;
	} catch (err) {
		console.error("Failed to send data to AI server:", err.message);
		throw new Error("AI server error");
	}
};

const updateCheckChat = async (id, message, userId) => {
	await supabase.from("assessment_messages").insert({
		assessment_id: id,
		text: message.text || null,
		sender_id: userId,
	});
	await supabase.from("assessments").update({ user_id: userId }).eq("id", id);

	const { data: allMsgs } = await supabase.from("assessment_messages").select("text").eq("assessment_id", id).order("created_at");
	const textMessages = (allMsgs || []).filter((m) => m.text).map((m) => m.text);

	try {
		const gptResponse = await axios.post(`${config.baseUrl}/assesment-chat`, {
			user_id: userId,
			chat_id: id,
			message: message.text,
			history: textMessages,
			general_info: message.generalInfo,
			check_type: message.checkType,
		});
		return gptResponse.data;
	} catch (err) {
		console.error("Failed to send data to AI server:", err.message);
		throw new Error("AI server error");
	}
};

const createCheckChat = async (message, generalInfo, checkType) => {
	const { data: survey, error } = await supabase.from("assessments").insert({ user_id: message.user }).select().single();
	if (error) throw error;

	if (message.messages) {
		const msgs = message.messages.map((m) => ({
			assessment_id: survey.id,
			text: m.text || null,
			sender_id: m.sender || message.user,
		}));
		await supabase.from("assessment_messages").insert(msgs);
	}

	try {
		const gptResponse = await axios.post(`${config.baseUrl}/check-chat`, {
			user_id: message.user,
			chat_id: survey.id,
			message: message.messages?.[0]?.text || "",
			history: [],
			general_info: generalInfo,
			check_type: checkType,
		});
		return gptResponse.data;
	} catch (err) {
		console.error("Failed to send data to AI server:", err.message);
		throw new Error("AI server error");
	}
};

const inspireMe = async (message) => {
	try {
		const gptResponse = await axios.post(`${config.baseUrl}/inspire`, message);
		return gptResponse.data;
	} catch (err) {
		console.error("Failed to send data to AI server:", err.message);
		throw new Error("AI server error");
	}
};

// ── Assessment Versioning ─────────────────────────────────────────

const saveVersion = async (assessmentId) => {
	// Get report from assessment_reports table
	const { data: report } = await supabase.from("assessment_reports")
		.select("*")
		.eq("assessment_id", assessmentId)
		.single();

	if (!report || !report.content) return null;

	// Get current messages as snapshot
	const { data: msgs } = await supabase.from("assessment_messages")
		.select("*")
		.eq("assessment_id", assessmentId)
		.order("created_at");

	// Get current version count
	const { count } = await supabase.from("assessment_versions")
		.select("*", { count: "exact", head: true })
		.eq("assessment_id", assessmentId);

	const versionNumber = (count || 0) + 1;

	const { data: version, error } = await supabase.from("assessment_versions").insert({
		assessment_id: assessmentId,
		version_number: versionNumber,
		report_content: report.content,
		messages_snapshot: JSON.stringify(msgs || []),
	}).select().single();

	if (error) throw error;
	return version;
};

const getVersions = async (assessmentId) => {
	const { data, error } = await supabase.from("assessment_versions")
		.select("id, version_number, report_content, created_at")
		.eq("assessment_id", assessmentId)
		.order("version_number", { ascending: false });

	if (error) throw error;
	return data || [];
};

const restoreVersion = async (assessmentId, versionId) => {
	const { data: version } = await supabase.from("assessment_versions")
		.select("*")
		.eq("id", versionId)
		.eq("assessment_id", assessmentId)
		.single();

	if (!version) throw new ApiError(httpStatus.NOT_FOUND, "Version not found");

	// Save current state as a new version before restoring
	await saveVersion(assessmentId);

	// Restore: delete current messages, re-insert from snapshot
	const snapshot = JSON.parse(version.messages_snapshot);
	await supabase.from("assessment_messages").delete().eq("assessment_id", assessmentId);

	const restored = snapshot.map((m) => ({
		assessment_id: assessmentId,
		text: m.text,
		sender_id: m.sender_id,
		pdf_path: m.pdf_path,
		general_info: m.general_info,
		survey_type: m.survey_type,
		assessment_name: m.assessment_name,
		check_type: m.check_type,
	}));
	await supabase.from("assessment_messages").insert(restored);

	// Restore report content
	await supabase.from("assessment_reports")
		.update({ content: version.report_content })
		.eq("assessment_id", assessmentId);

	return { success: true, restored_version: version.version_number };
};

module.exports = {
	createAssessment,
	createSurvey,
	updateAssessment,
	updateSurvey,
	get,
	createCheckChat,
	updateCheckChat,
	inspireMe,
	saveVersion,
	getVersions,
	restoreVersion,
};
