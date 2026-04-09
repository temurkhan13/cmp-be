const httpStatus = require("http-status");
const ApiError = require("../../utils/ApiError");
const config = require("../../config/config");
const { default: axios } = require("axios");
const supabase = require("../../config/supabase");
const paginate = require("../../utils/paginate");

const create = async (body) => {
	// Create chat
	const { data: chat, error } = await supabase.from("chats").insert({
		user_id: body.user,
	}).select().single();
	if (error) throw error;

	// Insert messages
	let pdfMessage = null;
	if (body.messages && body.messages.length > 0) {
		const msgs = body.messages.map((m) => ({
			chat_id: chat.id,
			text: m.text || null,
			sender_id: m.sender || body.user,
			pdf_path: m.pdfPath || null,
		}));
		await supabase.from("messages").insert(msgs);
		pdfMessage = body.messages.find((msg) => msg.pdfPath);
	}

	if (pdfMessage) {
		try {
			const gptResponse = await axios.post(`${config.baseUrl}/upload-files`, {
				pdf_file: pdfMessage.pdfPath,
				user_id: body.user,
				chat_id: chat.id,
			});
			// RAG ingest - best-effort, don't fail the request
			try {
				await axios.post(`${config.baseUrl}/ingest`, {
					user_id: String(body.user),
					workspace_id: "",
					folder_id: "",
					filename: pdfMessage.pdfPath,
					content: gptResponse.data.message || "",
				});
			} catch (e) {
				console.log("RAG ingest skipped:", e.message);
			}
			return gptResponse.data;
		} catch (err) {
			console.error("Failed to send data:", err);
		}
	} else {
		const { data: allMsgs } = await supabase.from("messages").select("text").eq("chat_id", chat.id).order("created_at");
		const textMessages = (allMsgs || []).filter((m) => m.text).map((m) => m.text);
		try {
			const gptResponse = await axios.post(`${config.baseUrl}/chat`, {
				user_id: body.user,
				chat_id: chat.id,
				message: textMessages.length > 0 ? textMessages[textMessages.length - 1] : null,
				history: textMessages,
			});
			return gptResponse.data;
		} catch (err) {
			console.error("Failed to send data to AI server:", err.message);
			throw new Error("AI server error");
		}
	}
};

const update = async (id, message, userId) => {
	// Insert new message
	await supabase.from("messages").insert({
		chat_id: id,
		text: message.text || null,
		sender_id: message.sender || userId,
		pdf_path: message.pdfPath || null,
	});

	// Update chat user
	await supabase.from("chats").update({ user_id: userId }).eq("id", id);

	if (message.pdfPath) {
		try {
			const gptResponse = await axios.post(`${config.baseUrl}/upload-files`, {
				pdf_file: message.pdfPath,
				user_id: userId,
				chat_id: id,
			});
			// RAG ingest - best-effort, don't fail the request
			try {
				await axios.post(`${config.baseUrl}/ingest`, {
					user_id: String(userId),
					workspace_id: "",
					folder_id: "",
					filename: message.pdfPath,
					content: gptResponse.data.message || "",
				});
			} catch (e) {
				console.log("RAG ingest skipped:", e.message);
			}
			return gptResponse.data;
		} catch (err) {
			console.error("Failed to send data:", err);
		}
	} else {
		const { data: allMsgs } = await supabase.from("messages").select("text").eq("chat_id", id).order("created_at");
		const textMessages = (allMsgs || []).filter((m) => m.text).map((m) => m.text);
		try {
			const gptResponse = await axios.post(`${config.baseUrl}/chat`, {
				user_id: userId,
				chat_id: id,
				message: textMessages.length > 0 ? textMessages[textMessages.length - 1] : null,
				history: textMessages,
			});
			return gptResponse.data;
		} catch (err) {
			console.error("Failed to send data to AI server:", err.message);
			throw new Error("AI server error");
		}
	}
};

const query = async (filter, options) => {
	const mapped = {};
	if (filter.user) mapped.user_id = filter.user;
	return paginate("chats", { filter: mapped, ...options }, supabase);
};

const get = async (id) => {
	const { data: chat } = await supabase.from("chats").select().eq("id", id).single();
	if (!chat) {
		throw new ApiError(httpStatus.NOT_FOUND, "Assessment not found");
	}
	// Get messages
	const { data: msgs } = await supabase.from("messages").select().eq("chat_id", id).order("created_at");
	chat.messages = msgs || [];
	return chat;
};

const updateChangeTone = async (chatId, messageId, body) => {
	const { data, error } = await supabase.from("messages").update({ text: body.text }).eq("id", messageId).eq("chat_id", chatId).select().single();
	if (error) throw error;
	return data;
};

// AI proxy functions — no DB changes
// Frontend sends {message} (string or {selectedText}) but AI service expects {text}
const toAiBody = (body) => {
	const { message, ...rest } = body;
	let text = rest.text || "";
	if (!text && message) {
		text = typeof message === "string" ? message : message.selectedText || "";
	}
	return { ...rest, text, message: text };
};
const changeTone = async (body) => { return (await axios.post(`${config.baseUrl}/change-tone`, toAiBody(body))).data; };
const translate = async (body) => { return (await axios.post(`${config.baseUrl}/translate`, toAiBody(body))).data; };
const improveWriting = async (body) => { return (await axios.post(`${config.baseUrl}/improve-writing`, toAiBody(body))).data; };
const fixGrammar = async (body) => { return (await axios.post(`${config.baseUrl}/fix-grammar`, toAiBody(body))).data; };
const shorterText = async (body) => { return (await axios.post(`${config.baseUrl}/make-shorter`, toAiBody(body))).data; };
const longerText = async (body) => { return (await axios.post(`${config.baseUrl}/make-longer`, toAiBody(body))).data; };
const languageSimplify = async (body) => { return (await axios.post(`${config.baseUrl}/simplify-language`, toAiBody(body))).data; };
const summarize = async (body) => { return (await axios.post(`${config.baseUrl}/summarize`, toAiBody(body))).data; };
const explain = async (body) => { return (await axios.post(`${config.baseUrl}/explain-this`, toAiBody(body))).data; };
const comprehensiveText = async (body) => { return (await axios.post(`${config.baseUrl}/comprehensive-text`, toAiBody(body))).data; };
const autoText = async (body) => { return (await axios.post(`${config.baseUrl}/auto-text`, toAiBody(body))).data; };
const inspireMe = async (body) => {
	const payload = {
		message: body.message,
		history: body.history || [""],
		general_info: body.general_info || "",
		bussiness_info: body.bussiness_info || "",
	};
	return (await axios.post(`${config.baseUrl}/inspire`, payload)).data;
};

module.exports = {
	create, update, get, query,
	changeTone, updateChangeTone, translate, improveWriting, fixGrammar,
	shorterText, longerText, languageSimplify, summarize, explain,
	comprehensiveText, autoText, inspireMe,
};
