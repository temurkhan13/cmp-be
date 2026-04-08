const httpStatus = require("http-status");
const supabase = require("../config/supabase");

const countWords = (text) => {
	if (!text) return 0;
	return text.trim().split(/\s+/).length;
};

const checkSubscription =
	(options = {}) =>
	async (req, res, next) => {
		try {
			const { user } = req;
			if (!user || !user.subscription) return next();

			const { data: userSub } = await supabase
				.from("user_subscriptions")
				.select("*, subscription:subscriptions(*)")
				.eq("id", user.subscription)
				.single();

			if (!userSub || !userSub.subscription) return next();

			if (userSub.subscription_status !== "active" && userSub.subscription_status !== "trialing") {
				return res.status(httpStatus.FORBIDDEN).json({ message: "Active subscription required" });
			}

			if (options.checkWordLimit && options.wordCountField) {
				const inputWords = countWords(req.body[options.wordCountField]);
				if (userSub.words_used + inputWords > userSub.subscription.word_limit) {
					return res.status(httpStatus.FORBIDDEN).json({ message: "Word limit exceeded. Please upgrade." });
				}
				await supabase
					.from("user_subscriptions")
					.update({ words_used: userSub.words_used + inputWords })
					.eq("id", userSub.id);
			}

			next();
		} catch (error) {
			console.error("Subscription check error:", error.message);
			next(); // fail open — don't block if check fails
		}
	};

module.exports = checkSubscription;
