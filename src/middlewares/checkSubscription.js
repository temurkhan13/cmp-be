const httpStatus = require("http-status");
const supabase = require("../config/supabase");

const countWords = (text) => {
	if (!text) return 0;
	return text.trim().split(/\s+/).length;
};

// Default limits for users with no subscription (free/Starter tier)
const FREE_TIER_LIMITS = {
	workspaces: 1,
	projects: 1,
	sitemaps: 3,
	wireframes: 1,
	version_history: 2,
	word_limit: 10000,
};

/**
 * Get the user's plan limits and current usage.
 * Returns { limits, wordsUsed, userSubId } or null if unlimited (Enterprise).
 */
const getUserPlanLimits = async (user) => {
	if (!user.subscription) {
		// No subscription record — apply free tier limits
		return { limits: FREE_TIER_LIMITS, wordsUsed: 0, userSubId: null };
	}

	const { data: userSub } = await supabase
		.from("user_subscriptions")
		.select("*, subscription:subscriptions(*)")
		.eq("id", user.subscription)
		.single();

	if (!userSub || !userSub.subscription) {
		return { limits: FREE_TIER_LIMITS, wordsUsed: 0, userSubId: null };
	}

	// Check subscription is active
	if (userSub.subscription_status !== "active" && userSub.subscription_status !== "trialing") {
		return { limits: FREE_TIER_LIMITS, wordsUsed: 0, userSubId: null };
	}

	return {
		limits: userSub.subscription,
		wordsUsed: userSub.words_used || 0,
		userSubId: userSub.id,
	};
};

/**
 * Count user's active (non-soft-deleted) workspaces.
 */
const countUserWorkspaces = async (userId) => {
	const { count } = await supabase
		.from("workspaces")
		.select("*", { count: "exact", head: true })
		.eq("user_id", userId)
		.eq("is_soft_deleted", false);
	return count || 0;
};

/**
 * Count user's active folders (projects) across all workspaces.
 */
const countUserProjects = async (userId) => {
	const { data: workspaces } = await supabase
		.from("workspaces")
		.select("id")
		.eq("user_id", userId)
		.eq("is_soft_deleted", false);

	if (!workspaces || workspaces.length === 0) return 0;

	const wsIds = workspaces.map((ws) => ws.id);
	const { count } = await supabase
		.from("folders")
		.select("*", { count: "exact", head: true })
		.in("workspace_id", wsIds)
		.eq("is_soft_deleted", false);
	return count || 0;
};

/**
 * Count user's sitemaps/digital playbooks.
 */
const countUserSitemaps = async (userId) => {
	const { count } = await supabase
		.from("digital_playbooks")
		.select("*", { count: "exact", head: true })
		.eq("user_id", userId);
	return count || 0;
};

/**
 * Count user's active wireframes across all folders.
 */
const countUserWireframes = async (userId) => {
	const { data: workspaces } = await supabase
		.from("workspaces")
		.select("id")
		.eq("user_id", userId)
		.eq("is_soft_deleted", false);

	if (!workspaces || workspaces.length === 0) return 0;

	const wsIds = workspaces.map((ws) => ws.id);
	const { data: folders } = await supabase
		.from("folders")
		.select("id")
		.in("workspace_id", wsIds)
		.eq("is_soft_deleted", false);

	if (!folders || folders.length === 0) return 0;

	const folderIds = folders.map((f) => f.id);
	const { count } = await supabase
		.from("folder_wireframes")
		.select("*", { count: "exact", head: true })
		.in("folder_id", folderIds);
	return count || 0;
};

const checkSubscription =
	(options = {}) =>
	async (req, res, next) => {
		try {
			const { user } = req;
			if (!user) return next();

			const plan = await getUserPlanLimits(user);
			if (!plan) return next();

			const { limits, wordsUsed, userSubId } = plan;
			const isUnlimited = (val) => val === -1;

			// ── Check workspace limit ────────────────────────────────
			if (options.checkWorkspace) {
				if (!isUnlimited(limits.workspaces)) {
					const current = await countUserWorkspaces(user.id);
					if (current >= limits.workspaces) {
						return res.status(httpStatus.FORBIDDEN).json({
							message: `Workspace limit reached (${limits.workspaces}). Please upgrade your plan.`,
							limitType: "workspaces",
							current,
							limit: limits.workspaces,
						});
					}
				}
			}

			// ── Check project/folder limit ────────────────────────────
			if (options.checkProject) {
				if (!isUnlimited(limits.projects)) {
					const current = await countUserProjects(user.id);
					if (current >= limits.projects) {
						return res.status(httpStatus.FORBIDDEN).json({
							message: `Project limit reached (${limits.projects}). Please upgrade your plan.`,
							limitType: "projects",
							current,
							limit: limits.projects,
						});
					}
				}
			}

			// ── Check sitemap limit ──────────────────────────────────
			if (options.checkSitemap) {
				if (!isUnlimited(limits.sitemaps)) {
					const current = await countUserSitemaps(user.id);
					if (current >= limits.sitemaps) {
						return res.status(httpStatus.FORBIDDEN).json({
							message: `Sitemap limit reached (${limits.sitemaps}). Please upgrade your plan.`,
							limitType: "sitemaps",
							current,
							limit: limits.sitemaps,
						});
					}
				}
			}

			// ── Check wireframe limit ────────────────────────────────
			if (options.checkWireframe) {
				if (!isUnlimited(limits.wireframes)) {
					const current = await countUserWireframes(user.id);
					if (current >= limits.wireframes) {
						return res.status(httpStatus.FORBIDDEN).json({
							message: `Digital Playbook limit reached (${limits.wireframes}). Please upgrade your plan.`,
							limitType: "wireframes",
							current,
							limit: limits.wireframes,
						});
					}
				}
			}

			// ── Check word limit ─────────────────────────────────────
			if (options.checkWordLimit && options.wordCountField) {
				if (!isUnlimited(limits.word_limit)) {
					const inputWords = countWords(req.body[options.wordCountField]);
					if (wordsUsed + inputWords > limits.word_limit) {
						return res.status(httpStatus.FORBIDDEN).json({
							message: `Word limit exceeded (${wordsUsed}/${limits.word_limit}). Please upgrade your plan.`,
							limitType: "word_limit",
							current: wordsUsed,
							limit: limits.word_limit,
						});
					}
					// Increment word count
					if (userSubId) {
						await supabase
							.from("user_subscriptions")
							.update({ words_used: wordsUsed + inputWords })
							.eq("id", userSubId);
					}
				}
			}

			// ── Check version history limit ──────────────────────────
			if (options.checkVersionHistory) {
				if (!isUnlimited(limits.version_history)) {
					const assessmentId = req.params.id;
					if (assessmentId) {
						const { count } = await supabase
							.from("assessment_versions")
							.select("*", { count: "exact", head: true })
							.eq("assessment_id", assessmentId);
						if ((count || 0) >= limits.version_history) {
							return res.status(httpStatus.FORBIDDEN).json({
								message: `Version history limit reached (${limits.version_history}). Please upgrade your plan.`,
								limitType: "version_history",
								current: count || 0,
								limit: limits.version_history,
							});
						}
					}
				}
			}

			next();
		} catch (error) {
			console.error("Subscription check error:", error.message);
			// Fail open — don't block if the check itself fails
			next();
		}
	};

module.exports = checkSubscription;
