const httpStatus = require("http-status");
const supabase = require("../config/supabase");

const countWords = (text) => {
	if (!text) return 0;
	return text.trim().split(/\s+/).length;
};

const checkSubscription =
	(options = {}) =>
	async (req, res, next) => {
		// Currently bypassed — enable when subscription enforcement is needed
		return next();
	};

module.exports = checkSubscription;
