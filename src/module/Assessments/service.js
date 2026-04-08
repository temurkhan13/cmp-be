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

module.exports = {
	createAssessment,
	createSurvey,
	updateAssessment,
	updateSurvey,
	get,
	createCheckChat,
	updateCheckChat,
	inspireMe,
};
