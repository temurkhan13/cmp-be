const httpStatus = require("http-status");
const ApiError = require("../../utils/ApiError");
const { tokenTypes } = require("../../config/tokens");
const Chat = require("./entity/model");
const Token = require("../tokens/entity/model");
const config = require("../../config/config");
const { default: axios } = require("axios");
const create = async (body) => {
	const chat = await Chat.create(body);
	console.log("chat", chat);

	if (chat.messages && chat.messages.some((msg) => msg.pdfPath)) {
		const pdfMessage = chat.messages.find((msg) => msg.pdfPath);
		const body = {
			pdf_file: pdfMessage.pdfPath,
			user_id: chat.user,
			chat_id: chat._id,
		};
		console.log("body", body);
		try {
			const gptResponse = await axios.post(`${config.baseUrl}/upload-files`, body);
			console.log("gptResponse", gptResponse);
			return gptResponse.data;
		} catch (error) {
			console.error("Failed to send data:", error);
		}
	} else {
		// Retrieve the full chat document with populated fields if needed
		const chatHistory = await Chat.findById(chat._id);
		// Assuming you want to send the entire chat history, not just the first text message
		const textMessages = chatHistory.messages.filter((msg) => msg.text).map((msg) => msg.text);

		console.log("textMessages", textMessages);

		const body = {
			user_id: chat.user,
			chat_id: chat._id,
			message: textMessages.length > 0 ? textMessages[textMessages.length - 1] : null,
			history: textMessages,
		};

		console.log("body axios", body);
		try {
			const gptResponse = await axios.post(`${config.baseUrl}/chat`, body);
			return gptResponse.data;
		} catch (error) {
			console.error("Failed to send data to AI server:", error.message);
			throw new Error("AI server error"); // Or handle the error in a way that suits your app
		}
	}
};
const update = async (id, message, userId) => {
	const chat = await Chat.findByIdAndUpdate(
		id,
		{ $push: { messages: message }, user: userId }, // Push the new message to the array
		{ new: true }, // Return the updated document
	);
	console.log("chat", chat);

	if (chat.messages && chat.messages.some((msg) => msg.pdfPath)) {
		const pdfMessage = chat.messages.find((msg) => msg.pdfPath);
		const body = {
			pdf_file: pdfMessage.pdfPath,
			user_id: chat.user,
			chat_id: chat._id,
		};
		console.log("body", body);
		try {
			const gptResponse = await axios.post(`${config.baseUrl}/upload-files`, body);
			console.log("gptResponse", gptResponse);
			return gptResponse.data;
		} catch (error) {
			console.error("Failed to send data:", error);
		}
	} else {
		// Retrieve the full chat document with populated fields if needed
		const chatHistory = await Chat.findById(chat._id);
		// Assuming you want to send the entire chat history, not just the first text message
		const textMessages = chatHistory.messages.filter((msg) => msg.text).map((msg) => msg.text);

		console.log("textMessages", textMessages);

		const body = {
			user_id: chat.user,
			chat_id: chat._id,
			message: textMessages.length > 0 ? textMessages[textMessages.length - 1] : null,
			history: textMessages,
		};

		console.log("body axios", body);
		try {
			const gptResponse = await axios.post(`${config.baseUrl}/chat`, body);
			return gptResponse.data;
		} catch (error) {
			console.error("Failed to send data to AI server:", error.message);
			throw new Error("AI server error"); // Or handle the error in a way that suits your app
		}
	}
};

const query = async (filter, options) => {
	const results = await Chat.paginate(filter, options);
	return results;
};
/**
 *
 * @param {*} id
 * @returns {Promise<About>}
 */
const get = async (id) => {
	const doc = await Chat.findOne({ _id: id });
	if (!doc) {
		throw new ApiError(httpStatus.NOT_FOUND, "Assessment not found");
	}
	return doc;
};
const changeTone = async (body) => {
	const gptResponse = await axios.post(`${config.baseUrl}/change-tone`, body);
	return gptResponse.data;
};
const updateChangeTone = async (chatId, messageId, body) => {
	const chat = await Chat.findByIdAndUpdate(
		chatId,
		{ $set: { "messages.$[elem].text": body.text } },
		{ arrayFilters: [{ "elem._id": messageId }], new: true },
	);

	const updatedMessage = chat.messages.find((message) => message._id.toString() === messageId);
	return updatedMessage;
};
const translate = async (body) => {
	const gptResponse = await axios.post(`${config.baseUrl}/translate`, body);
	console.log("gptResponse", gptResponse.data);
	return gptResponse.data;
};
const improveWriting = async (body) => {
	const gptResponse = await axios.post(`${config.baseUrl}/improve-writing`, body);
	console.log("gptResponse", gptResponse.data);
	return gptResponse.data;
};
const fixGrammar = async (body) => {
	const gptResponse = await axios.post(`${config.baseUrl}/fix-grammar`, body);
	console.log("gptResponse", gptResponse.data);
	return gptResponse.data;
};
const shorterText = async (body) => {
	const gptResponse = await axios.post(`${config.baseUrl}/make-shorter`, body);
	console.log("gptResponse", gptResponse.data);
	return gptResponse.data;
};
const longerText = async (body) => {
	const gptResponse = await axios.post(`${config.baseUrl}/make-longer`, body);
	console.log("gptResponse", gptResponse.data);
	return gptResponse.data;
};
const languageSimplify = async (body) => {
	const gptResponse = await axios.post(`${config.baseUrl}/simplify-language`, body);
	console.log("gptResponse", gptResponse.data);
	return gptResponse.data;
};
const summarize = async (body) => {
	const gptResponse = await axios.post(`${config.baseUrl}/summarize`, body);
	console.log("gptResponse", gptResponse.data);
	return gptResponse.data;
};
const explain = async (body) => {
	const gptResponse = await axios.post(`${config.baseUrl}/explain-this`, body);
	console.log("gptResponse", gptResponse.data);
	return gptResponse.data;
};
const comprehensiveText = async (body) => {
	const gptResponse = await axios.post(`${config.baseUrl}/comprehensive-text`, body);
	console.log("gptResponse", gptResponse.data);
	return gptResponse.data;
};
const autoText = async (body) => {
	const gptResponse = await axios.post(`${config.baseUrl}/auto-text`, body);
	console.log("gptResponse", gptResponse.data);
	return gptResponse.data;
};
const inspireMe = async (body) => {
	const payload = {
		message: body.message,
		history: body.history || [""],
		general_info: body.general_info || "",
		bussiness_info: body.bussiness_info || "",
	};

	const gptResponse = await axios.post(`${config.baseUrl}/inspire`, payload);
	return gptResponse.data;
};

module.exports = {
	create,
	update,
	get,
	query,
	changeTone,
	updateChangeTone,
	translate,
	improveWriting,
	fixGrammar,
	shorterText,
	longerText,
	languageSimplify,
	summarize,
	explain,
	comprehensiveText,
	autoText,
	inspireMe,
};
