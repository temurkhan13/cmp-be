const httpStatus = require("http-status");
const ApiError = require("../../utils/ApiError");
const supabase = require("../../config/supabase");
const paginate = require("../../utils/paginate");
const config = require("../../config/config");
const { default: axios } = require("axios");
const { parseJsonIfPossible, isArrayWithLength, deepMerge } = require("../../common/global.functions");

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
				.filter(
					([key, value]) =>
						typeof value === "string" &&
						value !== "empty" &&
						value.length > 0 &&
						!["Discovery", "Adopt", "Deploy", "Design", "Run"].includes(key),
				)
				.map(([heading, description]) => ({ heading, description }));

			nodes = ["Discovery", "Adopt", "Deploy", "Design", "Run"].map((heading) => ({
				heading,
				description: "empty",
			}));
		}

		return { stage: stageName, nodeData, nodes };
	});

	return { id: _id, stages: formattedStages };
};

/**
 * Helper: fetch a full playbook with stages, nodes, nodeData, comments, and replies
 */
const getFullPlaybook = async (playbookId) => {
	const { data: playbook, error } = await supabase
		.from("digital_playbooks")
		.select("*")
		.eq("id", playbookId)
		.single();
	if (error || !playbook) return null;

	const { data: stages } = await supabase
		.from("playbook_stages")
		.select("*")
		.eq("playbook_id", playbookId)
		.order("created_at", { ascending: true });

	playbook._id = playbook.id;
	playbook.stages = (stages || []).map(s => ({ ...s, _id: s.id }));

	for (const stage of playbook.stages) {
		const { data: nodes } = await supabase
			.from("playbook_nodes")
			.select("*")
			.eq("stage_id", stage.id)
			.order("created_at", { ascending: true });
		stage.nodes = (nodes || []).map(n => ({ ...n, _id: n.id }));

		const { data: stageNodeData } = await supabase
			.from("playbook_stage_node_data")
			.select("*")
			.eq("stage_id", stage.id)
			.order("created_at", { ascending: true });
		stage.nodeData = (stageNodeData || []).map(nd => ({ ...nd, _id: nd.id }));

		for (const node of stage.nodes) {
			const { data: nodeNodeData } = await supabase
				.from("playbook_stage_node_data")
				.select("*")
				.eq("node_id", node.id)
				.order("created_at", { ascending: true });
			node.nodeData = (nodeNodeData || []).map(nd => ({ ...nd, _id: nd.id }));
		}

		// Load comments for all nodeData entries (both stage-level and node-level)
		const allNodeDataIds = [
			...stage.nodeData.map((nd) => nd.id),
			...stage.nodes.flatMap((n) => n.nodeData.map((nd) => nd.id)),
		];

		if (allNodeDataIds.length > 0) {
			const { data: comments } = await supabase
				.from("playbook_comments")
				.select("*")
				.in("node_data_id", allNodeDataIds)
				.order("created_at", { ascending: true });

			const commentIds = (comments || []).map((c) => c.id);
			let replies = [];
			if (commentIds.length > 0) {
				const { data: repliesData } = await supabase
					.from("playbook_comment_replies")
					.select("*")
					.in("comment_id", commentIds)
					.order("created_at", { ascending: true });
				replies = repliesData || [];
			}

			// Attach replies to comments
			const commentsWithReplies = (comments || []).map((c) => ({
				...c,
				replies: replies.filter((r) => r.comment_id === c.id),
			}));

			// Attach comments to nodeData
			const attachComments = (ndList) => {
				for (const nd of ndList) {
					nd.comments = commentsWithReplies.filter((c) => c.node_data_id === nd.id);
				}
			};
			attachComments(stage.nodeData);
			for (const node of stage.nodes) {
				attachComments(node.nodeData);
			}
		}
	}

	return playbook;
};

const create = async (sitemapBody) => {
	try {
		const { data: playbook, error: insertError } = await supabase
			.from("digital_playbooks")
			.insert({
				name: sitemapBody.message?.substring(0, 100) || sitemapBody.sitemapName || "Initial Sitemap",
				message: sitemapBody.message,
				user_id: sitemapBody.userId,
			})
			.select()
			.single();

		if (insertError) throw new ApiError(httpStatus.BAD_REQUEST, insertError.message);

		const initialBody = {
			user_id: sitemapBody.userId,
			chat_id: playbook.id,
			message: sitemapBody.message,
			sitemap_name: sitemapBody.sitemapName,
		};

		let gptResponse = await axios.post(`${config.baseUrl}/sitemap`, initialBody);
		const transformedResponse = transformResponse({
			_id: playbook.id,
			stages: [
				{
					stage: sitemapBody.sitemapName,
					response: gptResponse.data,
				},
			],
		});

		// Insert stages, nodes, and nodeData into child tables
		for (const stageData of transformedResponse.stages) {
			const { data: stage, error: stageError } = await supabase
				.from("playbook_stages")
				.insert({ playbook_id: playbook.id, stage: stageData.stage })
				.select()
				.single();
			if (stageError) throw new ApiError(httpStatus.BAD_REQUEST, stageError.message);

			if (stageData.nodeData && stageData.nodeData.length > 0) {
				const nodeDataRows = stageData.nodeData.map((nd) => ({
					stage_id: stage.id,
					node_id: null,
					heading: nd.heading,
					description: nd.description,
				}));
				await supabase.from("playbook_stage_node_data").insert(nodeDataRows);
			}

			if (stageData.nodes && stageData.nodes.length > 0) {
				for (const nodeItem of stageData.nodes) {
					const { data: node } = await supabase
						.from("playbook_nodes")
						.insert({ stage_id: stage.id, heading: nodeItem.heading })
						.select()
						.single();

					if (node && nodeItem.nodeData && nodeItem.nodeData.length > 0) {
						const subRows = nodeItem.nodeData.map((nd) => ({
							stage_id: stage.id,
							node_id: node.id,
							heading: nd.heading,
							description: nd.description,
						}));
						await supabase.from("playbook_stage_node_data").insert(subRows);
					}
				}
			}
		}

		return await getFullPlaybook(playbook.id);
	} catch (error) {
		console.error("Sitemap/playbook error:", error.message, error.response?.data || "");
		throw new ApiError(httpStatus.BAD_REQUEST, `Sitemap error: ${error.message}`);
	}
};

const querySitemaps = async (filter, options) => {
	return await paginate("digital_playbooks", { ...options, filter }, supabase);
};

const getSitemap = async (id) => {
	const playbook = await getFullPlaybook(id);
	if (!playbook) throw new ApiError(httpStatus.BAD_REQUEST, "sitemap not found!");
	return playbook;
};

const deleteSitemap = async (id) => {
	const { data: playbook, error } = await supabase
		.from("digital_playbooks")
		.select("id")
		.eq("id", id)
		.single();
	if (error || !playbook) throw new ApiError(httpStatus.BAD_REQUEST, "sitemap not found!");

	// Child tables should cascade-delete via FK, but delete explicitly for safety
	const { data: stages } = await supabase
		.from("playbook_stages")
		.select("id")
		.eq("playbook_id", id);
	const stageIds = (stages || []).map((s) => s.id);

	if (stageIds.length > 0) {
		const { data: nodeDataRows } = await supabase
			.from("playbook_stage_node_data")
			.select("id")
			.in("stage_id", stageIds);
		const nodeDataIds = (nodeDataRows || []).map((nd) => nd.id);

		if (nodeDataIds.length > 0) {
			const { data: comments } = await supabase
				.from("playbook_comments")
				.select("id")
				.in("node_data_id", nodeDataIds);
			const commentIds = (comments || []).map((c) => c.id);

			if (commentIds.length > 0) {
				await supabase.from("playbook_comment_replies").delete().in("comment_id", commentIds);
				await supabase.from("playbook_comments").delete().in("node_data_id", nodeDataIds);
			}
		}

		await supabase.from("playbook_stage_node_data").delete().in("stage_id", stageIds);
		await supabase.from("playbook_nodes").delete().in("stage_id", stageIds);
		await supabase.from("playbook_stages").delete().eq("playbook_id", id);
	}

	await supabase.from("digital_playbooks").delete().eq("id", id);
	return { message: "Card remove successfully" };
};

const updateSitemap = async (id, sitemapBody) => {
	try {
		const { data: playbook, error } = await supabase
			.from("digital_playbooks")
			.select("*")
			.eq("id", id)
			.single();
		if (error || !playbook) throw new ApiError(httpStatus.BAD_REQUEST, "Sitemap not found");

		const initialBody = {
			user_id: sitemapBody.user,
			chat_id: playbook.id,
			message: sitemapBody.message,
			sitemap_name: sitemapBody.sitemapName,
		};

		let gptResponse = await axios.post(`${config.baseUrl}/sitemap`, initialBody);

		const transformedResponse = transformResponse({
			_id: playbook.id,
			stages: [
				{
					stage: sitemapBody.sitemapName,
					response: gptResponse.data,
				},
			],
		});

		// Insert new stages and child data
		for (const stageData of transformedResponse.stages) {
			const { data: stage, error: stageError } = await supabase
				.from("playbook_stages")
				.insert({ playbook_id: playbook.id, stage: stageData.stage })
				.select()
				.single();
			if (stageError) throw new ApiError(httpStatus.BAD_REQUEST, stageError.message);

			if (stageData.nodeData && stageData.nodeData.length > 0) {
				const nodeDataRows = stageData.nodeData.map((nd) => ({
					stage_id: stage.id,
					node_id: null,
					heading: nd.heading,
					description: nd.description,
				}));
				await supabase.from("playbook_stage_node_data").insert(nodeDataRows);
			}

			if (stageData.nodes && stageData.nodes.length > 0) {
				for (const nodeItem of stageData.nodes) {
					const { data: node } = await supabase
						.from("playbook_nodes")
						.insert({ stage_id: stage.id, heading: nodeItem.heading })
						.select()
						.single();

					if (node && nodeItem.nodeData && nodeItem.nodeData.length > 0) {
						const subRows = nodeItem.nodeData.map((nd) => ({
							stage_id: stage.id,
							node_id: node.id,
							heading: nd.heading,
							description: nd.description,
						}));
						await supabase.from("playbook_stage_node_data").insert(subRows);
					}
				}
			}
		}

		return await getFullPlaybook(playbook.id);
	} catch (error) {
		console.error("Sitemap/playbook error:", error.message, error.response?.data || "");
		throw new ApiError(httpStatus.BAD_REQUEST, `Sitemap error: ${error.message}`);
	}
};

const updateSitemapFields = async (id, updateBody) => {
	try {
		const playbook = await getFullPlaybook(id);
		if (!playbook) throw new ApiError(httpStatus.BAD_REQUEST, "Sitemap not found");

		for (const stageUpdate of updateBody.stages) {
			const stage = playbook.stages.find((s) => s.id === stageUpdate._id);
			if (!stage) {
				throw new ApiError(httpStatus.BAD_REQUEST, "Stage not found");
			}

			// Update or add nodeData (stage-level)
			for (const nodeDataUpdate of stageUpdate.nodeData) {
				if (nodeDataUpdate._id) {
					// Update existing
					const { error } = await supabase
						.from("playbook_stage_node_data")
						.update({
							heading: nodeDataUpdate.heading,
							description: nodeDataUpdate.description,
						})
						.eq("id", nodeDataUpdate._id);
					if (error) throw new ApiError(httpStatus.BAD_REQUEST, "NodeData not found");
				} else {
					// Insert new stage-level nodeData
					await supabase.from("playbook_stage_node_data").insert({
						stage_id: stage.id,
						node_id: null,
						heading: nodeDataUpdate.heading,
						description: nodeDataUpdate.description,
					});
				}
			}

			// Update or add nodes
			if (stageUpdate.nodes) {
				for (const nodeUpdate of stageUpdate.nodes) {
					if (nodeUpdate._id) {
						const { error } = await supabase
							.from("playbook_nodes")
							.update({ heading: nodeUpdate.heading })
							.eq("id", nodeUpdate._id);
						if (error) throw new ApiError(httpStatus.BAD_REQUEST, "Node not found");

						// If nodeData provided on the node update, replace node's nodeData
						if (nodeUpdate.nodeData) {
							// Delete old nodeData for this node
							await supabase
								.from("playbook_stage_node_data")
								.delete()
								.eq("node_id", nodeUpdate._id);
							// Insert new
							const rows = nodeUpdate.nodeData.map((nd) => ({
								stage_id: stage.id,
								node_id: nodeUpdate._id,
								heading: nd.heading,
								description: nd.description,
							}));
							if (rows.length > 0) {
								await supabase.from("playbook_stage_node_data").insert(rows);
							}
						}
					} else {
						// Insert new node
						const { data: newNode } = await supabase
							.from("playbook_nodes")
							.insert({ stage_id: stage.id, heading: nodeUpdate.heading })
							.select()
							.single();

						if (newNode && nodeUpdate.nodeData && nodeUpdate.nodeData.length > 0) {
							const rows = nodeUpdate.nodeData.map((nd) => ({
								stage_id: stage.id,
								node_id: newNode.id,
								heading: nd.heading,
								description: nd.description,
							}));
							await supabase.from("playbook_stage_node_data").insert(rows);
						}
					}
				}
			}
		}

		return await getFullPlaybook(id);
	} catch (error) {
		console.error("Error updating sitemap fields:", error.message);
		throw new ApiError(httpStatus.BAD_REQUEST, "Error updating sitemap fields");
	}
};

const wireFrame = async (wireframeBody) => {
	try {
		const initialBody = {
			user_id: wireframeBody.userId,
			chat_id: wireframeBody.chatId,
			message: wireframeBody.message,
			wireframe_name: wireframeBody.wireframeName,
			playbook: wireframeBody.playbook,
		};

		gptResponse = await axios.post(`${config.baseUrl}/wireframe`, initialBody);
		const response = gptResponse.data;
		return response;
	} catch (error) {
		console.error("Sitemap/playbook error:", error.message, error.response?.data || "");
		throw new ApiError(httpStatus.BAD_REQUEST, `Sitemap error: ${error.message}`);
	}
};

const createComment = async (playbookId, stageId, nodeId, nodeDataId, commentData) => {
	try {
		// Verify playbook exists
		const { data: playbook } = await supabase
			.from("digital_playbooks")
			.select("id")
			.eq("id", playbookId)
			.single();
		if (!playbook) throw new ApiError(httpStatus.BAD_REQUEST, "Playbook not found");

		// Verify stage exists
		const { data: stage } = await supabase
			.from("playbook_stages")
			.select("id")
			.eq("id", stageId)
			.eq("playbook_id", playbookId)
			.single();
		if (!stage) throw new ApiError(httpStatus.BAD_REQUEST, "Stage not found");

		// Verify nodeData exists
		const { data: nodeData } = await supabase
			.from("playbook_stage_node_data")
			.select("id")
			.eq("id", nodeDataId)
			.single();
		if (!nodeData) throw new ApiError(httpStatus.BAD_REQUEST, "Node data not found");

		const { data: comment, error } = await supabase
			.from("playbook_comments")
			.insert({
				node_data_id: nodeDataId,
				user_id: commentData.userId,
				user_name: commentData.userName,
				text: commentData.text,
				status: commentData.status || null,
			})
			.select()
			.single();

		if (error) throw new ApiError(httpStatus.BAD_REQUEST, error.message);
		return comment;
	} catch (error) {
		if (error instanceof ApiError) throw error;
		throw new ApiError(httpStatus.BAD_REQUEST, error.message);
	}
};

const updateComment = async (playbookId, stageId, nodeId, nodeDataId, commentId, commentData) => {
	try {
		// Verify chain exists
		const { data: playbook } = await supabase
			.from("digital_playbooks")
			.select("id")
			.eq("id", playbookId)
			.single();
		if (!playbook) throw new ApiError(httpStatus.BAD_REQUEST, "Playbook not found");

		const { data: stage } = await supabase
			.from("playbook_stages")
			.select("id")
			.eq("id", stageId)
			.eq("playbook_id", playbookId)
			.single();
		if (!stage) throw new ApiError(httpStatus.BAD_REQUEST, "Stage not found");

		const { data: nodeData } = await supabase
			.from("playbook_stage_node_data")
			.select("id")
			.eq("id", nodeDataId)
			.single();
		if (!nodeData) throw new ApiError(httpStatus.BAD_REQUEST, "Node data not found");

		const updateFields = {};
		if (commentData.text !== undefined) updateFields.text = commentData.text;
		if (commentData.status !== undefined) updateFields.status = commentData.status;
		if (commentData.userName !== undefined) updateFields.user_name = commentData.userName;

		const { data: comment, error } = await supabase
			.from("playbook_comments")
			.update(updateFields)
			.eq("id", commentId)
			.eq("node_data_id", nodeDataId)
			.select()
			.single();

		if (error || !comment) throw new ApiError(httpStatus.BAD_REQUEST, "Comment not found");
		return comment;
	} catch (error) {
		if (error instanceof ApiError) throw error;
		throw new ApiError(httpStatus.BAD_REQUEST, error.message);
	}
};

const deleteComment = async (playbookId, stageId, nodeId, nodeDataId, commentId) => {
	try {
		const { data: playbook } = await supabase
			.from("digital_playbooks")
			.select("id")
			.eq("id", playbookId)
			.single();
		if (!playbook) throw new ApiError(httpStatus.BAD_REQUEST, "Playbook not found");

		const { data: stage } = await supabase
			.from("playbook_stages")
			.select("id")
			.eq("id", stageId)
			.eq("playbook_id", playbookId)
			.single();
		if (!stage) throw new ApiError(httpStatus.BAD_REQUEST, "Stage not found");

		const { data: nodeData } = await supabase
			.from("playbook_stage_node_data")
			.select("id")
			.eq("id", nodeDataId)
			.single();
		if (!nodeData) throw new ApiError(httpStatus.BAD_REQUEST, "Node data not found");

		const { data: comment } = await supabase
			.from("playbook_comments")
			.select("id")
			.eq("id", commentId)
			.eq("node_data_id", nodeDataId)
			.single();
		if (!comment) throw new ApiError(httpStatus.BAD_REQUEST, "Comment not found");

		// Delete replies first, then comment
		await supabase.from("playbook_comment_replies").delete().eq("comment_id", commentId);
		await supabase.from("playbook_comments").delete().eq("id", commentId);

		return { success: true };
	} catch (error) {
		if (error instanceof ApiError) throw error;
		throw new ApiError(httpStatus.BAD_REQUEST, error.message);
	}
};

const createReply = async (playbookId, stageId, nodeId, nodeDataId, commentId, replyData) => {
	try {
		const { data: playbook } = await supabase
			.from("digital_playbooks")
			.select("id")
			.eq("id", playbookId)
			.single();
		if (!playbook) throw new ApiError(httpStatus.BAD_REQUEST, "Playbook not found");

		const { data: stage } = await supabase
			.from("playbook_stages")
			.select("id")
			.eq("id", stageId)
			.eq("playbook_id", playbookId)
			.single();
		if (!stage) throw new ApiError(httpStatus.BAD_REQUEST, "Stage not found");

		const { data: nodeData } = await supabase
			.from("playbook_stage_node_data")
			.select("id")
			.eq("id", nodeDataId)
			.single();
		if (!nodeData) throw new ApiError(httpStatus.BAD_REQUEST, "Node data not found");

		const { data: comment } = await supabase
			.from("playbook_comments")
			.select("id")
			.eq("id", commentId)
			.eq("node_data_id", nodeDataId)
			.single();
		if (!comment) throw new ApiError(httpStatus.BAD_REQUEST, "Comment not found");

		const { data: reply, error } = await supabase
			.from("playbook_comment_replies")
			.insert({
				comment_id: commentId,
				user_id: replyData.userId,
				user_name: replyData.userName,
				text: replyData.text,
			})
			.select()
			.single();

		if (error) throw new ApiError(httpStatus.BAD_REQUEST, error.message);
		return reply;
	} catch (error) {
		if (error instanceof ApiError) throw error;
		throw new ApiError(httpStatus.BAD_REQUEST, error.message);
	}
};

const updateReply = async (playbookId, stageId, nodeId, nodeDataId, commentId, replyId, replyData) => {
	try {
		const { data: playbook } = await supabase
			.from("digital_playbooks")
			.select("id")
			.eq("id", playbookId)
			.single();
		if (!playbook) throw new ApiError(httpStatus.BAD_REQUEST, "Playbook not found");

		const { data: stage } = await supabase
			.from("playbook_stages")
			.select("id")
			.eq("id", stageId)
			.eq("playbook_id", playbookId)
			.single();
		if (!stage) throw new ApiError(httpStatus.BAD_REQUEST, "Stage not found");

		const { data: nodeData } = await supabase
			.from("playbook_stage_node_data")
			.select("id")
			.eq("id", nodeDataId)
			.single();
		if (!nodeData) throw new ApiError(httpStatus.BAD_REQUEST, "Node data not found");

		const { data: comment } = await supabase
			.from("playbook_comments")
			.select("id")
			.eq("id", commentId)
			.eq("node_data_id", nodeDataId)
			.single();
		if (!comment) throw new ApiError(httpStatus.BAD_REQUEST, "Comment not found");

		const updateFields = {};
		if (replyData.text !== undefined) updateFields.text = replyData.text;
		if (replyData.userName !== undefined) updateFields.user_name = replyData.userName;

		const { data: reply, error } = await supabase
			.from("playbook_comment_replies")
			.update(updateFields)
			.eq("id", replyId)
			.eq("comment_id", commentId)
			.select()
			.single();

		if (error || !reply) throw new ApiError(httpStatus.BAD_REQUEST, "Reply not found");
		return reply;
	} catch (error) {
		if (error instanceof ApiError) throw error;
		throw new ApiError(httpStatus.BAD_REQUEST, error.message);
	}
};

const deleteReply = async (playbookId, stageId, nodeId, nodeDataId, commentId, replyId) => {
	try {
		const { data: playbook } = await supabase
			.from("digital_playbooks")
			.select("id")
			.eq("id", playbookId)
			.single();
		if (!playbook) throw new ApiError(httpStatus.BAD_REQUEST, "Playbook not found");

		const { data: stage } = await supabase
			.from("playbook_stages")
			.select("id")
			.eq("id", stageId)
			.eq("playbook_id", playbookId)
			.single();
		if (!stage) throw new ApiError(httpStatus.BAD_REQUEST, "Stage not found");

		const { data: nodeData } = await supabase
			.from("playbook_stage_node_data")
			.select("id")
			.eq("id", nodeDataId)
			.single();
		if (!nodeData) throw new ApiError(httpStatus.BAD_REQUEST, "Node data not found");

		const { data: comment } = await supabase
			.from("playbook_comments")
			.select("id")
			.eq("id", commentId)
			.eq("node_data_id", nodeDataId)
			.single();
		if (!comment) throw new ApiError(httpStatus.BAD_REQUEST, "Comment not found");

		const { data: reply } = await supabase
			.from("playbook_comment_replies")
			.select("id")
			.eq("id", replyId)
			.eq("comment_id", commentId)
			.single();
		if (!reply) throw new ApiError(httpStatus.BAD_REQUEST, "Reply not found");

		await supabase.from("playbook_comment_replies").delete().eq("id", replyId);
		return { success: true };
	} catch (error) {
		if (error instanceof ApiError) throw error;
		throw new ApiError(httpStatus.BAD_REQUEST, error.message);
	}
};

const simpleUpdate = async (id, body) => {
	const { data: existing } = await supabase
		.from("digital_playbooks")
		.select("id")
		.eq("id", id)
		.single();
	if (!existing) throw new ApiError(httpStatus.BAD_REQUEST, "Sitemap not found");

	const updateFields = {};
	if (body.name !== undefined) updateFields.name = body.name;
	if (body.message !== undefined) updateFields.message = body.message;

	const { data: updated, error } = await supabase
		.from("digital_playbooks")
		.update(updateFields)
		.eq("id", id)
		.select()
		.single();

	if (error) throw new ApiError(httpStatus.BAD_REQUEST, error.message);
	return updated;
};

const addNode = async (playbookId, stageId, nodeBody) => {
	const { data: playbook } = await supabase
		.from("digital_playbooks")
		.select("id")
		.eq("id", playbookId)
		.single();
	if (!playbook) throw new ApiError(httpStatus.NOT_FOUND, "Digital Playbook not found");

	const { data: stage } = await supabase
		.from("playbook_stages")
		.select("id")
		.eq("id", stageId)
		.eq("playbook_id", playbookId)
		.single();
	if (!stage) throw new ApiError(httpStatus.NOT_FOUND, "Stage not found");

	const { data: node, error } = await supabase
		.from("playbook_nodes")
		.insert({ stage_id: stageId, heading: nodeBody.heading })
		.select()
		.single();
	if (error) throw new ApiError(httpStatus.BAD_REQUEST, error.message);

	// Insert nodeData if provided
	if (nodeBody.nodeData && nodeBody.nodeData.length > 0) {
		const rows = nodeBody.nodeData.map((nd) => ({
			stage_id: stageId,
			node_id: node.id,
			heading: nd.heading,
			description: nd.description,
		}));
		await supabase.from("playbook_stage_node_data").insert(rows);
	}

	return await getFullPlaybook(playbookId);
};

const addNodeData = async (playbookId, stageId, nodeId, nodeDataBody) => {
	const { data: playbook } = await supabase
		.from("digital_playbooks")
		.select("id")
		.eq("id", playbookId)
		.single();
	if (!playbook) throw new ApiError(httpStatus.NOT_FOUND, "Digital Playbook not found");

	const { data: stage } = await supabase
		.from("playbook_stages")
		.select("id")
		.eq("id", stageId)
		.eq("playbook_id", playbookId)
		.single();
	if (!stage) throw new ApiError(httpStatus.NOT_FOUND, "Stage not found");

	const { data: node } = await supabase
		.from("playbook_nodes")
		.select("id")
		.eq("id", nodeId)
		.eq("stage_id", stageId)
		.single();
	if (!node) throw new ApiError(httpStatus.NOT_FOUND, "Node not found");

	await supabase.from("playbook_stage_node_data").insert({
		stage_id: stageId,
		node_id: nodeId,
		heading: nodeDataBody.heading,
		description: nodeDataBody.description,
		color: nodeDataBody.color || null,
	});

	return await getFullPlaybook(playbookId);
};

const updateNodeData = async (playbookId, stageId, nodeId, nodeDataId, updateBody) => {
	const { data: playbook } = await supabase
		.from("digital_playbooks")
		.select("id")
		.eq("id", playbookId)
		.single();
	if (!playbook) throw new ApiError(httpStatus.NOT_FOUND, "Digital Playbook not found");

	const { data: stage } = await supabase
		.from("playbook_stages")
		.select("id")
		.eq("id", stageId)
		.eq("playbook_id", playbookId)
		.single();
	if (!stage) throw new ApiError(httpStatus.NOT_FOUND, "Stage not found");

	const { data: node } = await supabase
		.from("playbook_nodes")
		.select("id")
		.eq("id", nodeId)
		.eq("stage_id", stageId)
		.single();
	if (!node) throw new ApiError(httpStatus.NOT_FOUND, "Node not found");

	if (nodeDataId) {
		// Update specific nodeData entry
		const updateFields = {};
		if (updateBody.heading !== undefined) updateFields.heading = updateBody.heading;
		if (updateBody.description !== undefined) updateFields.description = updateBody.description;
		if (updateBody.color !== undefined) updateFields.color = updateBody.color;

		const { error } = await supabase
			.from("playbook_stage_node_data")
			.update(updateFields)
			.eq("id", nodeDataId)
			.eq("node_id", nodeId);
		if (error) throw new ApiError(httpStatus.NOT_FOUND, "NodeData not found");
	} else {
		// Update the node itself
		const updateFields = {};
		if (updateBody.heading !== undefined) updateFields.heading = updateBody.heading;

		const { error } = await supabase
			.from("playbook_nodes")
			.update(updateFields)
			.eq("id", nodeId);
		if (error) throw new ApiError(httpStatus.BAD_REQUEST, error.message);
	}

	return await getFullPlaybook(playbookId);
};

const updateType = async (playbookId, stageId, type, typeId, updateBody) => {
	const { data: playbook } = await supabase
		.from("digital_playbooks")
		.select("id")
		.eq("id", playbookId)
		.single();
	if (!playbook) throw new ApiError(httpStatus.NOT_FOUND, "Digital Playbook not found");

	const { data: stage } = await supabase
		.from("playbook_stages")
		.select("id")
		.eq("id", stageId)
		.eq("playbook_id", playbookId)
		.single();
	if (!stage) throw new ApiError(httpStatus.NOT_FOUND, "Stage not found");

	if (type === "nodes") {
		const { data: node } = await supabase
			.from("playbook_nodes")
			.select("id")
			.eq("id", typeId)
			.eq("stage_id", stageId)
			.single();
		if (!node) throw new ApiError(httpStatus.NOT_FOUND, "Type not found");

		if (isArrayWithLength(updateBody)) {
			// updateBody is an array of nodeData updates - merge into existing nodeData
			for (const ndUpdate of updateBody) {
				if (ndUpdate._id || ndUpdate.id) {
					const ndId = ndUpdate._id || ndUpdate.id;
					const updateFields = {};
					if (ndUpdate.heading !== undefined) updateFields.heading = ndUpdate.heading;
					if (ndUpdate.description !== undefined) updateFields.description = ndUpdate.description;
					if (ndUpdate.color !== undefined) updateFields.color = ndUpdate.color;
					await supabase
						.from("playbook_stage_node_data")
						.update(updateFields)
						.eq("id", ndId)
						.eq("node_id", typeId);
				}
			}
		} else {
			// updateBody is a plain object - update the node heading
			const updateFields = {};
			if (updateBody.heading !== undefined) updateFields.heading = updateBody.heading;
			if (Object.keys(updateFields).length > 0) {
				await supabase.from("playbook_nodes").update(updateFields).eq("id", typeId);
			}
		}
	} else if (type === "nodeData") {
		// Stage-level nodeData
		const { data: nd } = await supabase
			.from("playbook_stage_node_data")
			.select("id")
			.eq("id", typeId)
			.eq("stage_id", stageId)
			.single();
		if (!nd) throw new ApiError(httpStatus.NOT_FOUND, "Type not found");

		const updateFields = {};
		if (updateBody.heading !== undefined) updateFields.heading = updateBody.heading;
		if (updateBody.description !== undefined) updateFields.description = updateBody.description;
		if (updateBody.color !== undefined) updateFields.color = updateBody.color;

		await supabase
			.from("playbook_stage_node_data")
			.update(updateFields)
			.eq("id", typeId);
	}

	return await getFullPlaybook(playbookId);
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
	updateType,
};
