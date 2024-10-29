const httpStatus = require("http-status");
const UserSubscription = require("../module/UserSubscription/entity/model");
const Workspace = require("../module/workSpaces/entity/modal");

const countWords = (text) => {
	if (!text) return 0;
	return text.trim().split(/\s+/).length;
};

const checkSubscription =
	(options = {}) =>
	async (req, res, next) => {
		return next();

		try {
			const { user } = req;
			if (!user) {
				return res.status(httpStatus.UNAUTHORIZED).json({ message: "User not found" });
			}
			const userSubscription = await UserSubscription.findById(user.subscription).populate("subscription");
			if (!userSubscription || userSubscription.subscriptionStatus !== "active") {
				return res.status(httpStatus.FORBIDDEN).json({ message: "Active subscription required" });
			}
			const subscription = userSubscription.subscription;
			const workspaces = await Workspace.find({ userId: user._id });

			if (options.checkWorkspace) {
				const workspaceCount = workspaces.length;
				if (workspaceCount >= subscription.workspaces) {
					return res.status(httpStatus.FORBIDDEN).json({ message: "Workspace limit reached" });
				}
			}
			if (options.checkFolderLimit && req.params.workspaceId) {
				const workspace = await Workspace.findById(req.params.workspaceId);
				if (!workspace) {
					return res.status(httpStatus.NOT_FOUND).json({ message: "Workspace not found" });
				}

				const folderCount = workspace.folders.length;
				if (folderCount >= subscription.folders) {
					return res.status(httpStatus.FORBIDDEN).json({ message: "Folder limit reached in this workspace" });
				}
			}
			if (options.checkProject) {
				const projectCount = workspaces.reduce((total, workspace) => total + workspace.folders.length, 0);
				if (projectCount >= subscription.projects) {
					return res.status(httpStatus.FORBIDDEN).json({ message: "Project limit reached" });
				}
			}
			if (options.checkSitemap) {
				const sitemapCount = workspaces.reduce(
					(total, workspace) => total + workspace.folders.reduce((total, folder) => total + folder.sitemaps.length, 0),
					0,
				);
				if (sitemapCount >= subscription.sitemaps) {
					return res.status(httpStatus.FORBIDDEN).json({ message: "Sitemap limit reached" });
				}
			}
			if (options.checkWireframe) {
				const wireframeCount = workspaces.reduce(
					(total, workspace) => total + workspace.folders.reduce((total, folder) => total + folder.wireframes.length, 0),
					0,
				);
				if (wireframeCount >= subscription.wireframes) {
					return res.status(httpStatus.FORBIDDEN).json({ message: "Wireframe limit reached" });
				}
			}
			if (options.checkVersionHistory) {
				const versionCount = workspaces.reduce((total, workspace) => total + workspace.versionHistory.length, 0);
				if (versionCount >= subscription.versionHistory) {
					return res.status(httpStatus.FORBIDDEN).json({ message: "Version history limit reached" });
				}
			}
			if (options.checkWordLimit) {
				const requestWordCount = countWords(req.body[options.wordCountField]);
				const totalWordsUsedAfterRequest = userSubscription.wordsUsed + requestWordCount;
				if (totalWordsUsedAfterRequest >= subscription.wordLimit) {
					await UserSubscription.findByIdAndUpdate(userSubscription._id, { wordsUsed: subscription.wordLimit });
					return res
						.status(httpStatus.FORBIDDEN)
						.json({ message: "Word limit exceeded. Please upgrade your subscription." });
				}
				await UserSubscription.findByIdAndUpdate(userSubscription._id, {
					$inc: { wordsUsed: requestWordCount },
				});
				let responseChecked = false;
				const originalSend = res.send.bind(res);

				res.send = async (doc) => {
					if (!responseChecked) {
						responseChecked = true;
						let responseWordCount = 0;
						if (doc && typeof doc === "object" && (doc.text || doc.message)) {
							const responseText = doc.text || doc.message;
							responseWordCount = countWords(responseText);
						}
						const totalWordsUsedAfterResponse = userSubscription.wordsUsed + requestWordCount + responseWordCount;
						if (totalWordsUsedAfterResponse >= subscription.wordLimit) {
							await UserSubscription.findByIdAndUpdate(userSubscription._id, {
								wordsUsed: subscription.wordLimit,
							});
						} else {
							await UserSubscription.findByIdAndUpdate(userSubscription._id, {
								$inc: { wordsUsed: responseWordCount },
							});
						}
					}

					return originalSend(doc);
				};
			}
			next();
		} catch (error) {
			res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: "Internal server error" });
		}
	};

module.exports = checkSubscription;
