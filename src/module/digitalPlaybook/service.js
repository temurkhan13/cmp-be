const httpStatus = require("http-status");
const ApiError = require("../../utils/ApiError");
const DigitalPlaybook = require("./entity/modal");
const config = require("../../config/config");
const { default: axios } = require("axios");
const { parseJsonIfPossible } = require("../../common/global.functions");

const transformSpecificNodeData = (nodeData) => {
	if (!Array.isArray(nodeData)) {
		return nodeData;
	}

	const about = nodeData.find((node) => node.heading === "About");
	const content = nodeData.find((node) => node.heading === "Content");

	if (about && content) {
		return [
			{
				heading: about.description,
				description: content.description,
			},
		];
	}

	return nodeData;
};
const transformResponse = (apiResponse) => {
	const { _id, stages } = apiResponse;
	const formattedStages = stages.map((stage) => {
		const stageName = stage.stage;
		const messageObj = parseJsonIfPossible(stage.response.message)[stageName];

		// Transform nodeData for specific stages
		let nodeData = [];
		let nodes = [];

		if (["Discovery", "Adopt", "Deploy", "Design", "Run"].includes(stageName)) {
			nodeData = transformSpecificNodeData(
				Object.entries(messageObj)
					.filter(([key, value]) => typeof value === "string" && value.length > 0)
					.map(([heading, description]) => ({ heading, description })),
			);

			nodes = Object.entries(messageObj)
				.filter(([key, value]) => typeof value === "object")
				.map(([heading, details]) => ({
					heading,
					nodeData: Object.entries(details).map(([subHeading, subDescription]) => ({
						heading: subHeading,
						description: subDescription,
					})),
				}));
		} else {
			nodeData = Object.entries(messageObj)
				.filter(([key, value]) => typeof value === "string" && value.length > 0)
				.map(([heading, description]) => ({ heading, description }));

			// nodes = Object.entries(messageObj)
			// 	.filter(([key, value]) => typeof value === "string" && value.length === 0)
			// 	.map(([heading]) => ({ heading, description: "empty" }));

			nodes = ["Discovery", "Adopt", "Deploy", "Design", "Run"].map((heading) => ({
				heading,
				description: "empty",
			}));
		}

		return { stage: stageName, nodeData, nodes };
	});

	return { id: _id, stages: formattedStages };
};
const create = async (sitemapBody) => {
	try {
		sitemapBody.name = sitemapBody.sitemapName || "Initial Sitemap";
		const sitemap = await DigitalPlaybook.create(sitemapBody);

		const initialBody = {
			user_id: sitemapBody.userId,
			chat_id: sitemap._id,
			message: sitemapBody.message,
			sitemap_name: sitemapBody.sitemapName,
		};

		let gptResponse = await axios.post(`${config.baseUrl}/sitemap`, initialBody);
		const transformedResponse = transformResponse({
			_id: sitemap._id,
			stages: [
				{
					stage: sitemapBody.sitemapName,
					response: gptResponse.data,
				},
			],
		});

		sitemap.stages = sitemap.stages || [];
		sitemap.stages.push(...transformedResponse.stages);
		await sitemap.save();

		return sitemap;
	} catch (error) {
		console.error("Failed to send data to AI server:", error.message);
		throw new ApiError(httpStatus.BAD_REQUEST, "AI server error");
	}
};
const querySitemaps = async (filter, options) => {
	return await DigitalPlaybook.paginate(filter, options);
};
const getSitemap = async (id) => {
	const sitemap = await DigitalPlaybook.findById(id);
	console.log("sitemap", sitemap);
	if (!sitemap) throw new ApiError(httpStatus.BAD_REQUEST, "sitemap not found!");
	return sitemap;
};
const deleteSitemap = async (id) => {
	const sitemap = await DigitalPlaybook.findById(id);
	console.log("sitemap", sitemap);
	if (!sitemap) throw new ApiError(httpStatus.BAD_REQUEST, "sitemap not found!");
	await sitemap.remove();
	return { message: "Card remove successfully" };
};
const updateSitemap = async (id, sitemapBody) => {
	try {
		// Step 1: Find the existing sitemap document
		const sitemap = await DigitalPlaybook.findById(id);
		if (!sitemap) throw new ApiError(httpStatus.BAD_REQUEST, "Sitemap not found");

		console.log("sitemap", sitemap);

		// Initial body for the request
		const initialBody = {
			user_id: sitemapBody.user,
			chat_id: sitemap._id,
			message: sitemapBody.message,
			sitemap_name: sitemapBody.sitemapName,
		};

		console.log("Initial body:", initialBody);

		// Step 2: Send the request to GPT
		let gptResponse = await axios.post(`${config.baseUrl}/sitemap`, initialBody);

		console.log("GPT response:", JSON.stringify(gptResponse.data, null, 2));

		const transformedResponse = transformResponse({
			_id: sitemap._id,
			stages: [
				{
					stage: sitemapBody.sitemapName,
					response: gptResponse.data,
				},
			],
		});

		console.log("Transformed response:", JSON.stringify(transformedResponse, null, 2));

		sitemap.stages = sitemap.stages || [];
		sitemap.stages.push(...transformedResponse.stages);
		await sitemap.save();

		return sitemap;
	} catch (error) {
		console.error("Failed to send data to AI server:", error.message);
		throw new ApiError(httpStatus.BAD_REQUEST, "AI server error");
	}
};
const updateSitemapFields = async (id, updateBody) => {
	try {
		const sitemap = await DigitalPlaybook.findById(id);
		if (!sitemap) throw new ApiError(httpStatus.BAD_REQUEST, "Sitemap not found");

		for (const stageUpdate of updateBody.stages) {
			const stage = sitemap.stages.id(stageUpdate._id);
			if (!stage) {
				throw new ApiError(httpStatus.BAD_REQUEST, "Stage not found");
			}

			// Update or add nodeData
			for (const nodeDataUpdate of stageUpdate.nodeData) {
				if (nodeDataUpdate._id) {
					const nodeData = stage.nodeData.id(nodeDataUpdate._id);
					if (nodeData) {
						nodeData.heading = nodeDataUpdate.heading;
						nodeData.description = nodeDataUpdate.description;
					} else {
						throw new ApiError(httpStatus.BAD_REQUEST, "NodeData not found");
					}
				} else {
					stage.nodeData.push({
						heading: nodeDataUpdate.heading,
						description: nodeDataUpdate.description,
					});
				}
			}

			// Update or add nodes if nodes are provided in the request body
			if (stageUpdate.nodes) {
				for (const nodeUpdate of stageUpdate.nodes) {
					if (nodeUpdate._id) {
						const node = stage.nodes.id(nodeUpdate._id);
						if (node) {
							node.heading = nodeUpdate.heading;
							node.nodeData = nodeUpdate.nodeData;
						} else {
							throw new ApiError(httpStatus.BAD_REQUEST, "Node not found");
						}
					} else {
						stage.nodes.push({
							heading: nodeUpdate.heading,
							nodeData: nodeUpdate.nodeData,
						});
					}
				}
			}
		}

		await sitemap.save();
		return sitemap;
	} catch (error) {
		console.error("Error updating sitemap fields:", error.message);
		throw new ApiError(httpStatus.BAD_REQUEST, "Error updating sitemap fields");
	}
};
const wireFrame = async (wireframeBody) => {
	try {
		// Initial body for the first request
		const initialBody = {
			user_id: wireframeBody.userId,
			chat_id: wireframeBody.chatId,
			message: wireframeBody.message,
			wireframe_name: wireframeBody.wireframeName,
			playbook: wireframeBody.playbook,
		};

		// Send the request for the current stage
		gptResponse = await axios.post(`${config.baseUrl}/wireframe`, initialBody);
		const response = gptResponse.data;
		return response;
	} catch (error) {
		console.error("Failed to send data to AI server:", error.message);
		throw new ApiError(httpStatus.BAD_REQUEST, "AI server error");
	}
};
const createComment = async (playbookId, stageId, nodeId, nodeDataId, commentData) => {
	const playbook = await DigitalPlaybook.findById(playbookId);
	if (!playbook) throw new ApiError(httpStatus.BAD_REQUEST, "Playbook not found");

	const stage = playbook.stages.id(stageId);
	if (!stage) throw new ApiError(httpStatus.BAD_REQUEST, "Stage not found");

	console.log("stage===", stage);
	console.log("stage.nodes===", stage.nodes);
	const node = nodeId ? stage.nodes.id(nodeId) : null;
	console.log("node===", node);

	const nodeData = nodeId ? node.nodeData.id(nodeDataId) : stage.nodeData.id(nodeDataId);
	console.log("nodeData===", nodeData);
	if (!nodeData) throw new ApiError(httpStatus.BAD_REQUEST, "Node data not found");

	nodeData.comments.push(commentData);
	await playbook.save();

	return nodeData.comments[nodeData.comments.length - 1];
};
const updateComment = async (playbookId, stageId, nodeId, nodeDataId, commentId, commentData) => {
	const playbook = await DigitalPlaybook.findById(playbookId);
	if (!playbook) throw new ApiError(httpStatus.BAD_REQUEST, "Playbook not found");

	const stage = playbook.stages.id(stageId);
	if (!stage) throw new ApiError(httpStatus.BAD_REQUEST, "Stage not found");

	const node = nodeId ? stage.nodes.id(nodeId) : null;
	const nodeData = nodeId ? node.nodeData.id(nodeDataId) : stage.nodeData.id(nodeDataId);
	if (!nodeData) throw new ApiError(httpStatus.BAD_REQUEST, "Node data not found");

	const comment = nodeData.comments.id(commentId);
	if (!comment) throw new ApiError(httpStatus.BAD_REQUEST, "Comment not found");

	Object.assign(comment, commentData);
	await playbook.save();

	return comment;
};
const deleteComment = async (playbookId, stageId, nodeId, nodeDataId, commentId) => {
	const playbook = await DigitalPlaybook.findById(playbookId);
	if (!playbook) throw new ApiError(httpStatus.BAD_REQUEST, "Playbook not found");

	const stage = playbook.stages.id(stageId);
	if (!stage) throw new ApiError(httpStatus.BAD_REQUEST, "Stage not found");

	const node = nodeId ? stage.nodes.id(nodeId) : null;
	const nodeData = nodeId ? node.nodeData.id(nodeDataId) : stage.nodeData.id(nodeDataId);
	if (!nodeData) throw new ApiError(httpStatus.BAD_REQUEST, "Node data not found");

	const comment = nodeData.comments.id(commentId);
	if (!comment) throw new ApiError(httpStatus.BAD_REQUEST, "Comment not found");

	comment.remove();
	await playbook.save();

	return { success: true };
};
const createReply = async (playbookId, stageId, nodeId, nodeDataId, commentId, replyData) => {
	const playbook = await DigitalPlaybook.findById(playbookId);
	if (!playbook) throw new ApiError(httpStatus.BAD_REQUEST, "Playbook not found");

	const stage = playbook.stages.id(stageId);
	if (!stage) throw new ApiError(httpStatus.BAD_REQUEST, "Stage not found");

	const node = nodeId ? stage.nodes.id(nodeId) : null;
	const nodeData = nodeId ? node.nodeData.id(nodeDataId) : stage.nodeData.id(nodeDataId);
	if (!nodeData) throw new ApiError(httpStatus.BAD_REQUEST, "Node data not found");

	const comment = nodeData.comments.id(commentId);
	if (!comment) throw new ApiError(httpStatus.BAD_REQUEST, "Comment not found");

	comment.replies.push(replyData);
	await playbook.save();

	return comment.replies[comment.replies.length - 1];
};
const updateReply = async (playbookId, stageId, nodeId, nodeDataId, commentId, replyId, replyData) => {
	const playbook = await DigitalPlaybook.findById(playbookId);
	if (!playbook) throw new ApiError(httpStatus.BAD_REQUEST, "Playbook not found");

	const stage = playbook.stages.id(stageId);
	if (!stage) throw new ApiError(httpStatus.BAD_REQUEST, "Stage not found");

	const node = nodeId ? stage.nodes.id(nodeId) : null;
	const nodeData = nodeId ? node.nodeData.id(nodeDataId) : stage.nodeData.id(nodeDataId);
	if (!nodeData) throw new ApiError(httpStatus.BAD_REQUEST, "Node data not found");

	const comment = nodeData.comments.id(commentId);
	if (!comment) throw new ApiError(httpStatus.BAD_REQUEST, "Comment not found");

	const reply = comment.replies.id(replyId);
	if (!reply) throw new ApiError(httpStatus.BAD_REQUEST, "Reply not found");

	Object.assign(reply, replyData);
	await playbook.save();

	return reply;
};
const deleteReply = async (playbookId, stageId, nodeId, nodeDataId, commentId, replyId) => {
	const playbook = await DigitalPlaybook.findById(playbookId);
	if (!playbook) throw new ApiError(httpStatus.BAD_REQUEST, "Playbook not found");

	const stage = playbook.stages.id(stageId);
	if (!stage) throw new ApiError(httpStatus.BAD_REQUEST, "Stage not found");

	const node = nodeId ? stage.nodes.id(nodeId) : null;
	const nodeData = nodeId ? node.nodeData.id(nodeDataId) : stage.nodeData.id(nodeDataId);
	if (!nodeData) throw new ApiError(httpStatus.BAD_REQUEST, "Node data not found");

	const comment = nodeData.comments.id(commentId);
	if (!comment) throw new ApiError(httpStatus.BAD_REQUEST, "Comment not found");

	const reply = comment.replies.id(replyId);
	if (!reply) throw new ApiError(httpStatus.BAD_REQUEST, "Reply not found");

	reply.remove();
	await playbook.save();

	return { success: true };
};
const simpleUpdate = async (id, body) => {
	const sitemap = await DigitalPlaybook.findById(id);
	if (!sitemap) throw new ApiError(httpStatus.BAD_REQUEST, "Sitemap not found");
	Object.assign(sitemap, body);
	await sitemap.save();
	return sitemap;
};
const addNode = async (playbookId, stageId, nodeBody) => {
	const playbook = await DigitalPlaybook.findById(playbookId);
	if (!playbook) {
		throw new ApiError(httpStatus.NOT_FOUND, "Digital Playbook not found");
	}

	const stage = playbook.stages.find((s) => s._id.toString() === stageId);
	if (!stage) {
		throw new ApiError(httpStatus.NOT_FOUND, "Stage not found");
	}

	stage.nodes.push(nodeBody);
	await playbook.save();
	return playbook;
};
const addNodeData = async (playbookId, stageId, nodeId, nodeDataBody) => {
	const playbook = await DigitalPlaybook.findById(playbookId);
	if (!playbook) {
		throw new ApiError(httpStatus.NOT_FOUND, "Digital Playbook not found");
	}

	const stage = playbook.stages.find((s) => s._id.toString() === stageId);
	if (!stage) {
		throw new ApiError(httpStatus.NOT_FOUND, "Stage not found");
	}

	const node = stage.nodes.find((n) => n._id.toString() === nodeId);
	if (!node) {
		throw new ApiError(httpStatus.NOT_FOUND, "Node not found");
	}

	node.nodeData.push(nodeDataBody);
	await playbook.save();
	return playbook;
};
const updateNodeData = async (playbookId, stageId, nodeId, nodeDataId, updateBody) => {
	const playbook = await DigitalPlaybook.findById(playbookId);
	if (!playbook) {
		throw new ApiError(httpStatus.NOT_FOUND, "Digital Playbook not found");
	}

	const stage = playbook.stages.find((s) => s._id.toString() === stageId);
	if (!stage) {
		throw new ApiError(httpStatus.NOT_FOUND, "Stage not found");
	}

	const node = stage.nodes.find((n) => n._id.toString() === nodeId);
	if (!node) {
		throw new ApiError(httpStatus.NOT_FOUND, "Node not found");
	}

	if (nodeDataId) {
		const nodeData = node.nodeData.find((nd) => nd._id.toString() === nodeDataId);
		if (!nodeData) {
			throw new ApiError(httpStatus.NOT_FOUND, "NodeData not found");
		}
		Object.assign(nodeData, updateBody);
	} else {
		Object.assign(node, updateBody);
	}

	await playbook.save();
	return playbook;
};

module.exports = {
	create,
	querySitemaps,
	getSitemap,
	deleteSitemap,
	updateSitemap,
	updateSitemapFields,
	wireFrame,
	createComment,
	updateComment,
	deleteComment,
	createReply,
	updateReply,
	deleteReply,
	simpleUpdate,
	addNode,
	addNodeData,
	updateNodeData,
};
