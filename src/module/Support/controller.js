const httpStatus = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const { handleSupportChat } = require("./service");

const supportChat = catchAsync(async (req, res) => {
	const { message, history } = req.body;
	const user = req.user;

	if (!message || !message.trim()) {
		return res.status(httpStatus.BAD_REQUEST).json({ message: "Message is required" });
	}

	const reply = await handleSupportChat(message, history || [], user);
	res.status(httpStatus.OK).json({ reply });
});

module.exports = { supportChat };
