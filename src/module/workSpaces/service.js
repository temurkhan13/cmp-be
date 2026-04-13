const httpStatus = require("http-status");
const ApiError = require("../../utils/ApiError");
const supabase = require("../../config/supabase");
const paginate = require("../../utils/paginate");
const { default: axios } = require("axios");
const path = require("path");
const config = require("../../config/config");
const { convertMarkdownToPDF } = require("../../utils/markdownToPDF");
const { sendInviteEmail } = require("../../utils/emailService");
const jwt = require("jsonwebtoken");
const {
	makeAxiosCall,
	isArrayWithLength,
	deepMerge,
	parseJsonIfPossible,
} = require("../../common/global.functions");
const { assignPageAndLayoutIndexes, formatQuestionsToString } = require("./helper");

// ─── Response Formatters (snake_case → camelCase) ────────────────

const formatWorkspace = (ws) => {
	if (!ws) return null;
	return {
		...ws,
		_id: ws.id,
		workspaceName: ws.workspace_name,
		workspaceDescription: ws.workspace_description,
		userId: ws.user_id,
		isActive: ws.is_active,
		isSoftDeleted: ws.is_soft_deleted,
		createdAt: ws.created_at,
		updatedAt: ws.updated_at,
		folders: (ws.folders || []).map(formatFolder),
	};
};

const formatFolder = (f) => {
	if (!f) return null;
	return {
		...f,
		_id: f.id,
		folderName: f.folder_name,
		workspaceId: f.workspace_id,
		isActive: f.is_active,
		isSoftDeleted: f.is_soft_deleted,
		createdAt: f.created_at,
		updatedAt: f.updated_at,
	};
};

// ─── Workspace CRUD ──────────────────────────────────────────────

const create = async (body) => {
	const { data, error } = await supabase
		.from("workspaces")
		.insert({
			workspace_name: body.workspaceName,
			workspace_description: body.workspaceDescription,
			user_id: body.userId,
			is_active: body.isActive ?? true,
		})
		.select()
		.single();
	if (error || !data) throw new ApiError(httpStatus.BAD_REQUEST, "something went wrong!");
	return formatWorkspace(data);
};

const query = async (filter, options) => {
	const paginateFilter = {};
	if (filter.userId) paginateFilter.user_id = filter.userId;
	if (filter.isSoftDeleted !== undefined) paginateFilter.is_soft_deleted = filter.isSoftDeleted;
	const result = await paginate("workspaces", { ...options, filter: paginateFilter }, supabase);
	if (result.results) {
		result.results = result.results.map(formatWorkspace);
	}
	return result;
};

const get = async (id) => {
	const { data, error } = await supabase
		.from("workspaces")
		.select("*")
		.eq("id", id)
		.eq("is_soft_deleted", false)
		.single();
	if (error || !data) throw new ApiError(httpStatus.BAD_REQUEST, "No workspace found!");
	return formatWorkspace(data);
};

const update = async (id, updateBody) => {
	const mapped = {};
	if (updateBody.workspaceName !== undefined) mapped.workspace_name = updateBody.workspaceName;
	if (updateBody.workspaceDescription !== undefined) mapped.workspace_description = updateBody.workspaceDescription;
	if (updateBody.isActive !== undefined) mapped.is_active = updateBody.isActive;
	if (updateBody.isSoftDeleted !== undefined) mapped.is_soft_deleted = updateBody.isSoftDeleted;

	const { data, error } = await supabase
		.from("workspaces")
		.update(mapped)
		.eq("id", id)
		.select()
		.single();
	if (error || !data) throw new ApiError(httpStatus.BAD_REQUEST, "No workspace found!");
	return formatWorkspace(data);
};

const deleteWorkspace = async (id) => {
	const { data: ws } = await supabase.from("workspaces").select("workspace_name").eq("id", id).single();
	if (!ws) throw new ApiError(httpStatus.BAD_REQUEST, "No workspace found!");
	if (ws.workspace_name === "Default Workspace")
		throw new ApiError(httpStatus.BAD_REQUEST, "Cannot delete Default workspace!");

	const { error } = await supabase.from("workspaces").delete().eq("id", id);
	if (error) throw new ApiError(httpStatus.BAD_REQUEST, error.message);
	return { success: true, message: "Workspace deleted successfully" };
};

// ─── Folder CRUD ─────────────────────────────────────────────────

const createFolder = async (workspaceId, folder) => {
	try {
		// Verify workspace exists
		const { data: ws } = await supabase.from("workspaces").select("id").eq("id", workspaceId).single();
		if (!ws) throw new ApiError(httpStatus.BAD_REQUEST, "Workspace not found!");

		const { data, error } = await supabase
			.from("folders")
			.insert({
				workspace_id: workspaceId,
				folder_name: folder.folderName,
				is_active: folder.isActive ?? false,
			})
			.select()
			.single();
		if (error) throw new ApiError(httpStatus.BAD_REQUEST, error.message);

		// Save business info if provided
		if (folder.businessInfo) {
			await supabase.from("folder_business_info").insert({
				folder_id: data.id,
				company_name: folder.businessInfo.companyName || "",
				company_size: parseInt(folder.businessInfo.companySize) || null,
				job_title: folder.businessInfo.jobTitle || "",
				industry: folder.businessInfo.industry || "",
			});
		}

		return formatFolder(data);
	} catch (error) {
		if (error instanceof ApiError) throw error;
		throw new ApiError(httpStatus.BAD_REQUEST, `Error creating folder: ${error.message}`);
	}
};

const updateFolder = async (workspaceId, folderId, updateBody) => {
	try {
		const { data: folder } = await supabase
			.from("folders")
			.select("*")
			.eq("id", folderId)
			.eq("workspace_id", workspaceId)
			.single();
		if (!folder) throw new ApiError(httpStatus.BAD_REQUEST, "Workspace or Folder not found!");

		// If setting this folder active, deactivate others in same workspace
		if (updateBody.isActive === true) {
			await supabase
				.from("folders")
				.update({ is_active: false })
				.eq("workspace_id", workspaceId)
				.neq("id", folderId)
				.eq("is_active", true);
		}

		const mapped = {};
		if (updateBody.folderName !== undefined) mapped.folder_name = updateBody.folderName;
		if (updateBody.isActive !== undefined) mapped.is_active = updateBody.isActive;
		if (updateBody.isSoftDeleted !== undefined) mapped.is_soft_deleted = updateBody.isSoftDeleted;

		const { data, error } = await supabase
			.from("folders")
			.update(mapped)
			.eq("id", folderId)
			.select()
			.single();
		if (error) throw new ApiError(httpStatus.BAD_REQUEST, error.message);
		return formatFolder(data);
	} catch (error) {
		if (error instanceof ApiError) throw error;
		throw new ApiError(httpStatus.BAD_REQUEST, `Error updating folder: ${error.message}`);
	}
};

const deleteFolder = async (workspaceId, folderId) => {
	try {
		const { data } = await supabase
			.from("folders")
			.select("id")
			.eq("id", folderId)
			.eq("workspace_id", workspaceId)
			.single();
		if (!data) throw new ApiError(httpStatus.BAD_REQUEST, "Workspace or Folder not found!");

		const { error } = await supabase.from("folders").delete().eq("id", folderId);
		if (error) throw new ApiError(httpStatus.BAD_REQUEST, error.message);
		return { success: true, message: "Folder deleted successfully" };
	} catch (error) {
		if (error instanceof ApiError) throw error;
		throw new ApiError(httpStatus.BAD_REQUEST, `Error deleting folder: ${error.message}`);
	}
};

// ─── Chat CRUD ───────────────────────────────────────────────────

const getFolderChats = async (workspaceId, folderId) => {
	const { data: folder } = await supabase
		.from("folders")
		.select("id")
		.eq("id", folderId)
		.eq("workspace_id", workspaceId)
		.single();
	if (!folder) throw new ApiError(httpStatus.BAD_REQUEST, "Workspace or Folder not found!");

	const { data: chats, error } = await supabase
		.from("folder_chats")
		.select("*")
		.eq("folder_id", folderId)
		.eq("is_soft_deleted", false)
		.order("created_at", { ascending: false });
	if (error) throw error;
	return chats || [];
};

const assistantChat = async (workspaceId, folderId) => {
	try {
		// Verify folder belongs to workspace
		const { data: folder } = await supabase
			.from("folders")
			.select("id")
			.eq("id", folderId)
			.eq("workspace_id", workspaceId)
			.single();
		if (!folder) throw new ApiError(httpStatus.BAD_REQUEST, "Workspace or Folder not found!");

		const { data: chat, error } = await supabase
			.from("folder_chats")
			.insert({
				folder_id: folderId,
				chat_title: "New Chat",
			})
			.select()
			.single();
		if (error) throw new ApiError(httpStatus.BAD_REQUEST, error.message);
		return chat;
	} catch (error) {
		if (error instanceof ApiError) throw error;
		throw new Error(`Error creating chat: ${error.message}`);
	}
};

const getAssistantChat = async (workspaceId, folderId, chatId) => {
	try {
		// Verify folder in workspace
		const { data: folder } = await supabase
			.from("folders")
			.select("id")
			.eq("id", folderId)
			.eq("workspace_id", workspaceId)
			.single();
		if (!folder) throw new ApiError(httpStatus.BAD_REQUEST, "Workspace, Folder, or chat not found!");

		const { data: chat } = await supabase
			.from("folder_chats")
			.select("*")
			.eq("id", chatId)
			.eq("folder_id", folderId)
			.single();
		if (!chat) throw new ApiError(httpStatus.BAD_REQUEST, "Chat not found!");
		if (chat.is_soft_deleted) throw new ApiError(httpStatus.NOT_FOUND, "Chat is soft-deleted and not available.");

		// Fetch messages with reactions
		const { data: messages } = await supabase
			.from("folder_chat_messages")
			.select("*, reactions:chat_message_reactions(*)")
			.eq("chat_id", chatId)
			.order("created_at", { ascending: true });

		// Fetch comments for this chat
		const { data: comments } = await supabase
			.from("folder_chat_comments")
			.select("*")
			.eq("chat_id", chatId)
			.order("created_at", { ascending: true });

		// Fetch bookmarks for this chat
		const { data: bookmarks } = await supabase
			.from("folder_chat_bookmarks")
			.select("*")
			.eq("chat_id", chatId);

		// Fetch replies for all comments
		const commentIds = (comments || []).map(c => c.id);
		let repliesByComment = {};
		if (commentIds.length > 0) {
			const { data: replies } = await supabase
				.from("folder_chat_comment_replies")
				.select("*")
				.in("comment_id", commentIds)
				.order("created_at", { ascending: true });
			(replies || []).forEach(r => {
				if (!repliesByComment[r.comment_id]) repliesByComment[r.comment_id] = [];
				repliesByComment[r.comment_id].push({ ...r, _id: r.id, replyId: r.id, userName: r.user_name, userId: r.user_id });
			});
		}

		// Attach comments (with replies) to their messages
		const commentsByMessage = {};
		(comments || []).forEach(c => {
			if (!commentsByMessage[c.message_id]) commentsByMessage[c.message_id] = [];
			commentsByMessage[c.message_id].push({
				...c, _id: c.id, messageId: c.message_id, userId: c.user_id, userName: c.user_name,
				replies: repliesByComment[c.id] || [],
			});
		});

		// Map reactions to camelCase (frontend expects react.user, react.type)
		const mapReactions = (reactions) => (reactions || []).map(r => ({
			...r, _id: r.id, user: r.user_id, messageId: r.message_id,
		}));

		chat.generalMessages = (messages || []).map(m => ({
			...m,
			_id: m.id,
			reactions: mapReactions(m.reactions),
			comments: commentsByMessage[m.id] || [],
		}));
		chat.bookmarks = (bookmarks || []).map(b => ({ ...b, _id: b.id, messageId: b.message_id, userId: b.user_id }));
		return chat;
	} catch (error) {
		if (error instanceof ApiError) throw error;
		throw new ApiError(httpStatus.BAD_REQUEST, `Error retrieving chat: ${error.message}`);
	}
};

const generateInviteLink = (workspaceId, folderId, chatId, email) => {
	const inviteToken = jwt.sign(
		{ workspaceId, folderId, chatId, email },
		process.env.JWT_SECRET,
		{ expiresIn: "7d" },
	);
	const inviteLink = `${config.frontendUrl}/invite?token=${inviteToken}`;
	return inviteLink;
};

const updateMessageText = async (workspaceId, folderId, chatId, messageId, body) => {
	// Verify chat belongs to folder/workspace
	const { data: chat } = await supabase
		.from("folder_chats")
		.select("id")
		.eq("id", chatId)
		.eq("folder_id", folderId)
		.single();
	if (!chat) throw new ApiError(httpStatus.BAD_REQUEST, "Chat not found!");

	const { data, error } = await supabase
		.from("folder_chat_messages")
		.update({ text: body.text })
		.eq("id", messageId)
		.eq("chat_id", chatId)
		.select()
		.single();
	if (error) throw new ApiError(httpStatus.BAD_REQUEST, error.message);
	return { ...data, _id: data.id };
};

const shareChat = async (workspaceId, folderId, chatId, userIdToShare) => {
	// Verify chat exists
	const { data: chat } = await supabase
		.from("folder_chats")
		.select("id, folder_id")
		.eq("id", chatId)
		.single();
	if (!chat) throw new ApiError(httpStatus.NOT_FOUND, "Workspace, Folder, or Chat not found!");

	// Check if user already shared
	const { data: existing } = await supabase
		.from("folder_chat_shared_users")
		.select("id")
		.eq("chat_id", chatId)
		.eq("user_id", userIdToShare)
		.maybeSingle();
	if (existing) throw new ApiError(httpStatus.BAD_REQUEST, "User already has access to this chat.");

	// Get user email
	const { data: user } = await supabase
		.from("users")
		.select("id, email")
		.eq("id", userIdToShare)
		.single();
	if (!user) throw new ApiError(httpStatus.NOT_FOUND, "User not found!");

	const inviteLink = generateInviteLink(workspaceId, folderId, chatId, user.email);
	await sendInviteEmail(user.email, inviteLink);

	// Add to user_shared_chats
	await supabase.from("user_shared_chats").insert({
		user_id: userIdToShare,
		workspace_id: workspaceId,
		folder_id: folderId,
		chat_id: chatId,
	});

	return chat;
};

const acceptChatInvite = async (token) => {
	try {
		const decoded = jwt.verify(token, config.jwt.secret);
		const { workspaceId, folderId, chatId, email } = decoded;

		const { data: user } = await supabase
			.from("users")
			.select("id")
			.eq("email", email)
			.single();
		if (!user) throw new ApiError(httpStatus.BAD_REQUEST, "User not found");

		// Verify chat exists
		const { data: chat } = await supabase
			.from("folder_chats")
			.select("id")
			.eq("id", chatId)
			.single();
		if (!chat) throw new ApiError(httpStatus.NOT_FOUND, "Workspace or chat not found");

		// Add shared user
		await supabase.from("folder_chat_shared_users").insert({
			chat_id: chatId,
			user_id: user.id,
		});

		const { data: updatedChat } = await supabase
			.from("folder_chats")
			.select("*, folder_chat_shared_users(*)")
			.eq("id", chatId)
			.single();

		return { success: true, chat: updatedChat };
	} catch (error) {
		if (error instanceof ApiError) throw error;
		throw new ApiError(httpStatus.BAD_REQUEST, `Error accepting invite: ${error.message}`);
	}
};

const deleteAssistantChat = async (workspaceId, folderId, chatId) => {
	try {
		const { data: folder } = await supabase
			.from("folders")
			.select("id")
			.eq("id", folderId)
			.eq("workspace_id", workspaceId)
			.single();
		if (!folder) throw new ApiError(httpStatus.BAD_REQUEST, "Workspace, Folder, or Chat not found!");

		const { data: chat } = await supabase
			.from("folder_chats")
			.select("id, is_soft_deleted")
			.eq("id", chatId)
			.eq("folder_id", folderId)
			.single();
		if (!chat) throw new ApiError(httpStatus.BAD_REQUEST, "Chat not found!");

		if (chat.is_soft_deleted) {
			await supabase.from("folder_chats").delete().eq("id", chatId);
			return { success: true, message: "Chat permanently deleted" };
		} else {
			await supabase.from("folder_chats").update({ is_soft_deleted: true }).eq("id", chatId);
			return { success: true, message: "Chat soft deleted. Please make another request to permanently delete." };
		}
	} catch (error) {
		if (error instanceof ApiError) throw error;
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Error deleting chat: ${error.message}`);
	}
};

const assistantChatUpdate = async (workspaceId, folderId, chatId, messageData) => {
	try {
		const { data: folder } = await supabase
			.from("folders")
			.select("id, workspace_id")
			.eq("id", folderId)
			.eq("workspace_id", workspaceId)
			.single();
		if (!folder) throw new ApiError(httpStatus.BAD_REQUEST, "Workspace or Folder not found!");

		// Get workspace userId for AI calls
		const { data: workspace } = await supabase
			.from("workspaces")
			.select("user_id")
			.eq("id", workspaceId)
			.single();

		if (chatId === "newChat") {
			// Create new chat — use first message as title
			const chatTitle = messageData.text
				? messageData.text.substring(0, 60).replace(/\n/g, " ") + (messageData.text.length > 60 ? "..." : "")
				: "New Chat";
			const { data: newChat, error: chatErr } = await supabase
				.from("folder_chats")
				.insert({ folder_id: folderId, chat_title: chatTitle })
				.select()
				.single();
			if (chatErr) throw new ApiError(httpStatus.BAD_REQUEST, chatErr.message);

			// Insert user message
			const { data: userMsg } = await supabase
				.from("folder_chat_messages")
				.insert({
					chat_id: newChat.id,
					text: messageData.text,
					sender_id: messageData.sender,
					from: "user",
					pdf_path: messageData.pdfPath || null,
				})
				.select()
				.single();

			// Insert media/documents if present
			if (isArrayWithLength(messageData.media)) {
				const mediaRows = messageData.media.map((m) => ({
					chat_id: newChat.id,
					file_name: m.name || m.fileName,
					url: m.url,
				}));
				await supabase.from("folder_chat_media").insert(mediaRows);
			}
			if (isArrayWithLength(messageData.documents)) {
				const docRows = messageData.documents.map((d) => ({
					chat_id: newChat.id,
					file_name: d.name || d.fileName,
					name: d.name,
					date: d.date || null,
					size: d.size || null,
				}));
				await supabase.from("folder_chat_documents").insert(docRows);
			}

			const body = {
				user_id: String(messageData.sender || ""),
				chat_id: String(newChat.id),
				message: messageData.text || "",
				history: [],
			};

			const chatFromAI = await getChatFromAI(body);

			if (Object.keys(chatFromAI).length > 0) {
				if (chatFromAI.message) {
					await supabase.from("folder_chat_messages").insert({
						chat_id: newChat.id,
						text: chatFromAI.message,
						from: "ai",
					});
				}
				if (chatFromAI.title) {
					await supabase.from("folder_chats").update({ chat_title: chatFromAI.title }).eq("id", newChat.id);
					newChat.chat_title = chatFromAI.title;
				}
			}

			return {
				success: true,
				message: "Chat added or updated successfully",
				chat: newChat,
				text: chatFromAI.message,
			};
		}

		// Existing chat
		const { data: chat } = await supabase
			.from("folder_chats")
			.select("id")
			.eq("id", chatId)
			.eq("folder_id", folderId)
			.single();
		if (!chat) throw new ApiError(httpStatus.BAD_REQUEST, "Chat not found!");

		// Insert user message
		await supabase.from("folder_chat_messages").insert({
			chat_id: chatId,
			text: messageData.text,
			sender_id: messageData.sender,
			from: "user",
			pdf_path: messageData.pdfPath || null,
		});

		const isMedia = isArrayWithLength(messageData.media);
		const isDocument = isArrayWithLength(messageData.documents);

		if (isMedia) {
			const mediaRows = messageData.media.map((m) => ({
				chat_id: chatId,
				file_name: m.name || m.fileName,
				url: m.url,
			}));
			await supabase.from("folder_chat_media").insert(mediaRows);
		}
		if (isDocument) {
			const docRows = messageData.documents.map((d) => ({
				chat_id: chatId,
				file_name: d.name || d.fileName,
				name: d.name,
				date: d.date || null,
				size: d.size || null,
			}));
			await supabase.from("folder_chat_documents").insert(docRows);
		}

		// Read uploaded file content directly from disk
		let fileContent = "";
		if (messageData.pdfPath) {
			try {
				const fs = require("fs");
				const pathMod = require("path");
				const filePath = pathMod.join("public/uploads", messageData.pdfPath);
				if (fs.existsSync(filePath)) {
					const ext = pathMod.extname(messageData.pdfPath).toLowerCase();
					if (ext === ".pdf") {
						try {
							const pdfParse = require("pdf-parse");
							const dataBuffer = fs.readFileSync(filePath);
							const pdfData = await pdfParse(dataBuffer);
							fileContent = pdfData.text || "";
							console.log("PDF parsed successfully:", fileContent.length, "chars");
						} catch (pdfErr) {
							console.log("PDF parse error:", pdfErr.message);
						}
					} else if (ext === ".docx") {
						try {
							const mammoth = require("mammoth");
							const result = await mammoth.extractRawText({ path: filePath });
							fileContent = result.value || "";
						} catch (docxErr) {
							console.log("DOCX parse error:", docxErr.message);
						}
					} else {
						// txt, csv, etc — read as text
						try {
							fileContent = fs.readFileSync(filePath, "utf-8");
						} catch (readErr) {
							const buf = fs.readFileSync(filePath);
							fileContent = buf.toString("utf-8").replace(/[^\x20-\x7E\n\r\t]/g, " ").trim();
						}
					}
					if (fileContent.length > 30000) {
						fileContent = fileContent.substring(0, 30000) + "\n[...truncated...]";
					}
					console.log(`File read: ${messageData.pdfPath} (${fileContent.length} chars)`);
				} else {
					console.log("File not found:", filePath);
				}
			} catch (e) {
				console.log("File read error:", e.message);
			}

			// RAG ingest for future searches
			if (fileContent) {
				try {
					await axios.post(`${config.baseUrl}/ingest`, {
						user_id: String(messageData.sender),
						workspace_id: "",
						folder_id: "",
						filename: messageData.pdfPath,
						content: fileContent,
					});
				} catch (e) {
					console.log("RAG ingest skipped:", e.message);
				}
			}
		}

		// Fetch all text messages for history
		const { data: allMessages } = await supabase
			.from("folder_chat_messages")
			.select("text")
			.eq("chat_id", chatId)
			.not("text", "is", null)
			.order("created_at", { ascending: true });

		const textMessages = (allMessages || []).map((m) => m.text);

		const aiBody = {
			user_id: messageData.sender,
			chat_id: chatId,
			message: fileContent
				? `The user uploaded a document. Here is its content:\n\n${fileContent}\n\nUser question: ${messageData.text || "Please analyze and summarize this document."}`
				: messageData.text,
			history: textMessages,
		};

		try {
			const gptResponse = await axios.post(`${config.baseUrl}/chat`, aiBody);

			const { data: aiMsg } = await supabase
				.from("folder_chat_messages")
				.insert({
					chat_id: chatId,
					text: gptResponse.data.message,
					from: "ai",
				})
				.select()
				.single();

			if (gptResponse.data?.title) {
				await supabase.from("folder_chats").update({ chat_title: gptResponse.data.title }).eq("id", chatId);
			}

			const result = { ...aiMsg };

			if (result && (isMedia || isDocument)) {
				const pdfPath = messageData?.media?.at(0) || messageData?.documents?.at(0);
				pdfPath.url = `${config.rootPath}${pdfPath.name || pdfPath.url}`;
				result.file = pdfPath;
			}

			return result;
		} catch (error) {
			throw new Error("AI server error");
		}
	} catch (error) {
		if (error instanceof ApiError) throw error;
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
	}
};

const getChatMedia = async (workspaceId, folderId, chatId) => {
	try {
		// Verify hierarchy
		const { data: folder } = await supabase
			.from("folders")
			.select("id")
			.eq("id", folderId)
			.eq("workspace_id", workspaceId)
			.single();
		if (!folder) throw new ApiError(httpStatus.NOT_FOUND, "Workspace, Folder, or Chat not found!");

		const { data: chat } = await supabase
			.from("folder_chats")
			.select("id")
			.eq("id", chatId)
			.eq("folder_id", folderId)
			.single();
		if (!chat) throw new ApiError(httpStatus.NOT_FOUND, "Chat not found!");

		const { data: media } = await supabase
			.from("folder_chat_media")
			.select("*")
			.eq("chat_id", chatId);
		return media || [];
	} catch (error) {
		if (error instanceof ApiError) throw error;
		throw new ApiError(httpStatus.NOT_FOUND, `error getting chat media: ${error.message}`);
	}
};

const getChatLinks = async (workspaceId, folderId, chatId) => {
	try {
		const { data: folder } = await supabase
			.from("folders")
			.select("id")
			.eq("id", folderId)
			.eq("workspace_id", workspaceId)
			.single();
		if (!folder) throw new ApiError(httpStatus.NOT_FOUND, "Workspace, Folder, or Chat not found!");

		const { data: chat } = await supabase
			.from("folder_chats")
			.select("id")
			.eq("id", chatId)
			.eq("folder_id", folderId)
			.single();
		if (!chat) throw new ApiError(httpStatus.NOT_FOUND, "Chat not found!");

		const { data: links } = await supabase
			.from("folder_chat_links")
			.select("*")
			.eq("chat_id", chatId);
		return links || [];
	} catch (error) {
		if (error instanceof ApiError) throw error;
		throw new ApiError(httpStatus.NOT_FOUND, `error getting chat links: ${error.message}`);
	}
};

const getChatDocuments = async (workspaceId, folderId, chatId) => {
	try {
		const { data: folder } = await supabase
			.from("folders")
			.select("id")
			.eq("id", folderId)
			.eq("workspace_id", workspaceId)
			.single();
		if (!folder) throw new ApiError(httpStatus.NOT_FOUND, "Workspace, Folder, or Chat not found!");

		const { data: chat } = await supabase
			.from("folder_chats")
			.select("id")
			.eq("id", chatId)
			.eq("folder_id", folderId)
			.single();
		if (!chat) throw new ApiError(httpStatus.NOT_FOUND, "Chat not found!");

		const { data: documents } = await supabase
			.from("folder_chat_documents")
			.select("*")
			.eq("chat_id", chatId);
		return documents || [];
	} catch (error) {
		if (error instanceof ApiError) throw error;
		throw new ApiError(httpStatus.NOT_FOUND, `error getting chat documents: ${error.message}`);
	}
};

// ─── Comments (polymorphic: chat / assessment / wireframe) ───────

const _getCommentsTable = (contextType) => {
	if (contextType === "chat") return "folder_chat_comments";
	if (contextType === "assessment") return "folder_assessment_comments";
	if (contextType === "wireframe") return "folder_wireframe_comments";
	return null;
};

const createComment = async (
	workspaceId,
	folderId,
	contextId,
	messageId,
	commentData,
	contextType,
) => {
	try {
		const table = _getCommentsTable(contextType);
		if (!table) throw new ApiError(httpStatus.BAD_REQUEST, "Invalid context type!");

		// Build insert row — chat comments reference chat_id, assessment reference assessment_id, wireframe reference wireframe_id
		const row = {
			user_id: commentData.userId,
			user_name: commentData.userName,
			text: commentData.text,
			status: commentData.status || "active",
		};

		if (contextType === "chat") {
			// Verify chat exists
			const { data: chat } = await supabase.from("folder_chats").select("id").eq("id", contextId).single();
			if (!chat) throw new ApiError(httpStatus.BAD_REQUEST, "Chat not found!");
			row.chat_id = contextId;
			row.message_id = messageId;
		} else if (contextType === "assessment") {
			row.chat_id = contextId; // assessment comments use the same FK pattern
			row.message_id = messageId;
		} else if (contextType === "wireframe") {
			const { data: wf } = await supabase.from("folder_wireframes").select("id").eq("id", contextId).single();
			if (!wf) throw new ApiError(httpStatus.BAD_REQUEST, "Wireframe not found!");
			row.wireframe_id = contextId;
		}

		const { data: newComment, error } = await supabase
			.from(table)
			.insert(row)
			.select()
			.single();
		if (error) throw new ApiError(httpStatus.BAD_REQUEST, error.message);

		// For chat comments, attach the message text
		if (contextType === "chat" && messageId) {
			const { data: msg } = await supabase
				.from("folder_chat_messages")
				.select("text")
				.eq("id", messageId)
				.single();
			if (msg) newComment.message = msg.text;
		}

		return newComment;
	} catch (error) {
		if (error instanceof ApiError) throw error;
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
	}
};

const getUserChatComments = async (userId) => {
	try {
		const { data: comments } = await supabase
			.from("folder_chat_comments")
			.select(`
				*,
				chat:folder_chats(
					id, folder_id,
					folder:folders(id, workspace_id)
				)
			`)
			.eq("user_id", userId);

		return (comments || []).map((c) => ({
			workspaceId: c.chat?.folder?.workspace_id,
			folderId: c.chat?.folder_id,
			chatId: c.chat_id,
			messageId: c.message_id,
			comment: c,
		}));
	} catch (error) {
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
	}
};

const updateComment = async (workspaceId, folderId, contextId, messageId, commentId, commentData, contextType) => {
	try {
		const table = _getCommentsTable(contextType);
		if (!table) throw new ApiError(httpStatus.BAD_REQUEST, "Invalid context type!");

		const mapped = {};
		if (commentData.text !== undefined) mapped.text = commentData.text;
		if (commentData.status !== undefined) mapped.status = commentData.status;

		const { data, error } = await supabase
			.from(table)
			.update(mapped)
			.eq("id", commentId)
			.select()
			.single();
		if (error || !data) throw new ApiError(httpStatus.BAD_REQUEST, "Comment not found!");
		return data;
	} catch (error) {
		if (error instanceof ApiError) throw error;
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
	}
};

const deleteComment = async (workspaceId, folderId, chatId, messageId, commentId) => {
	try {
		const { error } = await supabase
			.from("folder_chat_comments")
			.delete()
			.eq("id", commentId);
		if (error) throw new ApiError(httpStatus.BAD_REQUEST, error.message);
		return { success: true, message: "Comment deleted successfully" };
	} catch (error) {
		if (error instanceof ApiError) throw error;
		throw new ApiError(httpStatus.BAD_REQUEST, `Error deleting comment: ${error.message}`);
	}
};

// ─── Bookmarks ───────────────────────────────────────────────────

const bookmarkMessage = async (workspaceId, folderId, contextId, messageId, userId, contextType) => {
	try {
		if (contextType === "chat") {
			const { data, error } = await supabase
				.from("folder_chat_bookmarks")
				.insert({ chat_id: contextId, user_id: userId, message_id: messageId })
				.select()
				.single();
			if (error) throw new ApiError(httpStatus.BAD_REQUEST, error.message);
			return data;
		} else if (contextType === "assessment") {
			// Assessment bookmarks use the assessment bookmark table if it exists,
			// otherwise fall back to a generic pattern
			const { data, error } = await supabase
				.from("folder_chat_bookmarks")
				.insert({ chat_id: contextId, user_id: userId, message_id: messageId })
				.select()
				.single();
			if (error) throw new ApiError(httpStatus.BAD_REQUEST, error.message);
			return data;
		}
		throw new ApiError(httpStatus.BAD_REQUEST, "Invalid context type!");
	} catch (error) {
		if (error instanceof ApiError) throw error;
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
	}
};

const unbookmarkMessage = async (workspaceId, folderId, contextId, messageId, bookmarkId, contextType) => {
	try {
		const { data } = await supabase
			.from("folder_chat_bookmarks")
			.select("*")
			.eq("id", bookmarkId)
			.single();
		if (!data) throw new ApiError(httpStatus.BAD_REQUEST, "Bookmark not found!");

		await supabase.from("folder_chat_bookmarks").delete().eq("id", bookmarkId);
		return data;
	} catch (error) {
		if (error instanceof ApiError) throw error;
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
	}
};

const getBookmarksForUser = async (userId) => {
	try {
		const { data: bookmarks } = await supabase
			.from("folder_chat_bookmarks")
			.select(`
				*,
				chat:folder_chats(
					id, folder_id,
					folder:folders(id, workspace_id)
				)
			`)
			.eq("user_id", userId);

		return (bookmarks || []).map((b) => ({
			workspaceId: b.chat?.folder?.workspace_id,
			folderId: b.chat?.folder_id,
			chatId: b.chat_id,
			messageId: b.message_id,
			bookmark: b,
		}));
	} catch (error) {
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
	}
};

const getBookmarksForChat = async (userId, workspaceId, folderId, chatId) => {
	try {
		const { data: bookmarks } = await supabase
			.from("folder_chat_bookmarks")
			.select("*")
			.eq("chat_id", chatId)
			.eq("user_id", userId);

		return (bookmarks || []).map((b) => ({
			workspaceId,
			folderId,
			chatId,
			messageId: b.message_id,
			bookmark: b,
		}));
	} catch (error) {
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
	}
};

// ─── Comment Replies ─────────────────────────────────────────────

const addReplyToComment = async (workspaceId, folderId, chatId, messageId, commentId, replyData) => {
	try {
		const { data, error } = await supabase
			.from("folder_chat_comment_replies")
			.insert({
				comment_id: commentId,
				user_id: replyData.userId,
				user_name: replyData.userName,
				text: replyData.text,
			})
			.select()
			.single();
		if (error) throw new ApiError(httpStatus.BAD_REQUEST, error.message);
		return data;
	} catch (error) {
		if (error instanceof ApiError) throw error;
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
	}
};

const updateReplyInComment = async (workspaceId, folderId, chatId, messageId, commentId, replyId, replyData) => {
	try {
		const mapped = {};
		if (replyData.text !== undefined) mapped.text = replyData.text;

		const { data, error } = await supabase
			.from("folder_chat_comment_replies")
			.update(mapped)
			.eq("id", replyId)
			.eq("comment_id", commentId)
			.select()
			.single();
		if (error || !data) throw new ApiError(httpStatus.BAD_REQUEST, "Reply not found!");
		return data;
	} catch (error) {
		if (error instanceof ApiError) throw error;
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
	}
};

// ─── Assessment CRUD ─────────────────────────────────────────────

const createAssessment = async (workspaceId, folderId, body) => {
	try {
		// Get workspace userId
		const { data: workspace } = await supabase
			.from("workspaces")
			.select("user_id")
			.eq("id", workspaceId)
			.single();
		if (!workspace) throw new ApiError(httpStatus.BAD_REQUEST, "Workspace or Folder not found!");

		const apiBody = {
			user_id: workspace.user_id,
			chat_id: folderId,
			message: body.message || "",
			general_info: body.generalInfo || "",
			business_info: body.business_info || "",
			assessment_name: body.assessmentName,
		};

		const gptURL = `${config.baseUrl}/assesment-chat`;
		const gptResponse = await makeAxiosCall({ url: gptURL, method: "POST", data: apiBody });
		const nextQuestion = gptResponse.message;

		// Create assessment
		const { data: assessment, error: assessErr } = await supabase
			.from("folder_assessments")
			.insert({
				folder_id: folderId,
				name: body.name,
				version: 1,
			})
			.select()
			.single();
		if (assessErr) throw new ApiError(httpStatus.BAD_REQUEST, assessErr.message);

		// Create report
		const { data: report } = await supabase
			.from("folder_assessment_reports")
			.insert({
				assessment_id: assessment.id,
				report_title: "Initial Assessment Report",
			})
			.select()
			.single();

		// Create sub-report
		const { data: subReport } = await supabase
			.from("folder_assessment_sub_reports")
			.insert({
				report_id: report.id,
				report_title: body.assessmentName,
			})
			.select()
			.single();

		// Create first QA entry
		await supabase.from("folder_assessment_sub_report_qa").insert({
			sub_report_id: subReport.id,
			question: nextQuestion,
			answer: "",
		});

		const markdownPattern = /(```|#\s|-\s|\*\*|_\s|>\s)/;
		const containsMarkdown = markdownPattern.test(nextQuestion);
		let isReportGenerated = false;

		if (containsMarkdown) {
			const pdfFileName = `${Date.now()}_initial_assessment_report.pdf`;
			const pdfFilePath = path.resolve(process.cwd(), "public/uploads", pdfFileName);
			convertMarkdownToPDF(nextQuestion, pdfFilePath);

			await supabase.from("folder_assessment_reports").update({
				final_report: nextQuestion,
				final_report_url: `/uploads/${pdfFileName}`,
				is_report_generated: true,
			}).eq("id", report.id);

			isReportGenerated = true;
		} else {
			// Add another QA entry for the next question
			await supabase.from("folder_assessment_sub_report_qa").insert({
				sub_report_id: subReport.id,
				question: nextQuestion,
				answer: "",
			});
		}

		// Insert media/documents if present
		if (isArrayWithLength(body.media)) {
			const mediaRows = body.media.map((m) => ({
				assessment_id: assessment.id,
				file_name: m.name || m.fileName,
				url: m.url,
			}));
			await supabase.from("folder_assessment_media").insert(mediaRows);
		}
		if (isArrayWithLength(body.documents)) {
			const docRows = body.documents.map((d) => ({
				assessment_id: assessment.id,
				file_name: d.name || d.fileName,
				name: d.name,
				date: d.date || null,
				size: d.size || null,
			}));
			await supabase.from("folder_assessment_documents").insert(docRows);
		}

		// Return full assessment object
		const result = { ...assessment, text: nextQuestion, isReportGenerated };
		return result;
	} catch (error) {
		if (error instanceof ApiError) throw error;
		throw new ApiError(httpStatus.BAD_REQUEST, `Error creating assessment: ${error.message}`);
	}
};

const updateAssessment = async (workspaceId, folderId, assessmentId, subReportId, updateBody) => {
	try {
		const { data: workspace } = await supabase.from("workspaces").select("user_id").eq("id", workspaceId).single();
		if (!workspace) throw new ApiError(httpStatus.BAD_REQUEST, "Workspace, Folder, or Assessment not found!");

		const { data: assessment } = await supabase
			.from("folder_assessments")
			.select("id, name")
			.eq("id", assessmentId)
			.single();
		if (!assessment) throw new ApiError(httpStatus.BAD_REQUEST, "Assessment not found!");

		// Get the sub-report
		const { data: subReport } = await supabase
			.from("folder_assessment_sub_reports")
			.select("id, report_title, report_id")
			.eq("id", subReportId)
			.single();
		if (!subReport) throw new ApiError(httpStatus.BAD_REQUEST, "Sub-report not found!");

		// Get all QA for this sub-report, update the last one with the answer
		const { data: qaItems } = await supabase
			.from("folder_assessment_sub_report_qa")
			.select("*")
			.eq("sub_report_id", subReportId)
			.order("created_at", { ascending: true });

		if (!isArrayWithLength(qaItems)) {
			throw new ApiError(httpStatus.BAD_REQUEST, "No questionAnswer items found in this assessment.");
		}

		const lastQA = qaItems[qaItems.length - 1];
		await supabase.from("folder_assessment_sub_report_qa").update({
			answer: updateBody.content,
		}).eq("id", lastQA.id);

		// Build history from all QA
		const textMessages = ["", ...qaItems.flatMap((qa) => [qa.question, qa.answer])];

		const apiBody = {
			user_id: workspace.user_id,
			chat_id: assessmentId,
			message: updateBody.content,
			history: textMessages,
			general_info: "",
			business_info: "",
			assessment_name: subReport.report_title,
		};

		const gptURL = `${config.baseUrl}/assesment-chat`;
		const gptResponse = await makeAxiosCall({ url: gptURL, method: "POST", data: apiBody });

		if (!gptResponse) {
			throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, "Error making API call to GPT!");
		}

		const markdownPattern = /(```|#\s|-\s|\*\*|_\s|>\s)/;
		const containsMarkdown = markdownPattern.test(gptResponse.message);
		const nextQuestion = gptResponse.message;

		if (containsMarkdown) {
			const pdfFileName = `${Date.now()}_assessment_report.pdf`;
			const pdfFilePath = path.resolve(process.cwd(), "public/uploads", pdfFileName);
			convertMarkdownToPDF(gptResponse.message, pdfFilePath);

			// Get current report to create sub-report from previous
			const { data: report } = await supabase
				.from("folder_assessment_reports")
				.select("*")
				.eq("id", subReport.report_id)
				.single();

			if (report && report.final_report) {
				await supabase.from("folder_assessment_sub_reports").insert({
					report_id: report.id,
					final_sub_report: report.final_report,
					final_sub_report_url: report.final_report_url,
					report_title: "Previous Assessment Report",
				});
			}

			await supabase.from("folder_assessment_reports").update({
				final_report: gptResponse.message,
				final_report_url: `/uploads/${pdfFileName}`,
				is_report_generated: true,
				report_title: gptResponse.title || report?.report_title,
			}).eq("id", subReport.report_id);
		} else {
			// Store next question
			await supabase.from("folder_assessment_sub_report_qa").insert({
				sub_report_id: subReportId,
				question: nextQuestion,
				answer: "",
			});
		}

		// Handle media/documents
		if (isArrayWithLength(updateBody.media)) {
			const mediaRows = updateBody.media.map((m) => ({
				assessment_id: assessmentId,
				file_name: m.name || m.fileName,
				url: m.url,
			}));
			await supabase.from("folder_assessment_media").insert(mediaRows);
		}
		if (isArrayWithLength(updateBody.documents)) {
			const docRows = updateBody.documents.map((d) => ({
				assessment_id: assessmentId,
				file_name: d.name || d.fileName,
				name: d.name,
				date: d.date || null,
				size: d.size || null,
			}));
			await supabase.from("folder_assessment_documents").insert(docRows);
		}

		return {
			success: true,
			question: { content: nextQuestion, timestamp: new Date() },
			text: nextQuestion,
			isReportGenerated: containsMarkdown,
		};
	} catch (error) {
		if (error instanceof ApiError) throw error;
		throw new ApiError(httpStatus.BAD_REQUEST, `Error storing user response: ${error.message}`);
	}
};

const getAssessment = async (workspaceId, folderId, assessmentId) => {
	try {
		const { data: assessment } = await supabase
			.from("folder_assessments")
			.select(`
				*,
				reports:folder_assessment_reports(
					*,
					sub_reports:folder_assessment_sub_reports(
						*,
						question_answer:folder_assessment_sub_report_qa(*)
					)
				)
			`)
			.eq("id", assessmentId)
			.eq("folder_id", folderId)
			.single();
		if (!assessment) throw new ApiError(httpStatus.BAD_REQUEST, "Assessment not found!");
		if (assessment.is_soft_deleted) throw new ApiError(httpStatus.NOT_FOUND, "Assessment is soft-deleted and not available.");
		return assessment;
	} catch (error) {
		if (error instanceof ApiError) throw error;
		throw new ApiError(httpStatus.BAD_REQUEST, `Error retrieving assessment: ${error.message}`);
	}
};

const deleteAssessment = async (workspaceId, folderId, assessmentId) => {
	try {
		const { data: assessment } = await supabase
			.from("folder_assessments")
			.select("id, is_soft_deleted")
			.eq("id", assessmentId)
			.eq("folder_id", folderId)
			.single();
		if (!assessment) throw new ApiError(httpStatus.BAD_REQUEST, "Assessment not found!");

		if (assessment.is_soft_deleted) {
			await supabase.from("folder_assessments").delete().eq("id", assessmentId);
			return { success: true, message: "Assessment permanently deleted" };
		} else {
			await supabase.from("folder_assessments").update({ is_soft_deleted: true }).eq("id", assessmentId);
			return { success: true, message: "Assessment soft deleted" };
		}
	} catch (error) {
		if (error instanceof ApiError) throw error;
		throw new ApiError(httpStatus.BAD_REQUEST, `Error deleting assessment: ${error.message}`);
	}
};

// ─── Business Info CRUD ──────────────────────────────────────────

const createBusinessInfo = async (workspaceId, folderId, body) => {
	try {
		const { data: folder } = await supabase.from("folders").select("id").eq("id", folderId).eq("workspace_id", workspaceId).single();
		if (!folder) throw new ApiError(httpStatus.BAD_REQUEST, "Workspace or Folder not found!");

		const { data, error } = await supabase
			.from("folder_business_info")
			.insert({
				folder_id: folderId,
				company_size: body.companySize,
				company_name: body.companyName,
				job_title: body.jobTitle,
				industry: body.industry,
				role: body.role,
				user_name: body.userName,
			})
			.select()
			.single();
		if (error) throw new ApiError(httpStatus.BAD_REQUEST, error.message);

		return { success: true, message: "Business information created successfully", data };
	} catch (error) {
		if (error instanceof ApiError) throw error;
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Error creating business information: ${error.message}`);
	}
};

const getBusinessInfo = async (workspaceId, folderId, businessInfoId) => {
	try {
		const { data } = await supabase
			.from("folder_business_info")
			.select("*")
			.eq("id", businessInfoId)
			.eq("folder_id", folderId)
			.single();
		if (!data) throw new ApiError(httpStatus.NOT_FOUND, "Business information not found!");
		return data;
	} catch (error) {
		if (error instanceof ApiError) throw error;
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Error retrieving business information: ${error.message}`);
	}
};

const updateBusinessInfo = async (workspaceId, folderId, businessInfoId, body) => {
	try {
		const mapped = {};
		if (body.companySize !== undefined) mapped.company_size = body.companySize;
		if (body.companyName !== undefined) mapped.company_name = body.companyName;
		if (body.jobTitle !== undefined) mapped.job_title = body.jobTitle;
		if (body.industry !== undefined) mapped.industry = body.industry;
		if (body.role !== undefined) mapped.role = body.role;
		if (body.userName !== undefined) mapped.user_name = body.userName;

		const { data, error } = await supabase
			.from("folder_business_info")
			.update(mapped)
			.eq("id", businessInfoId)
			.eq("folder_id", folderId)
			.select()
			.single();
		if (error || !data) throw new ApiError(httpStatus.BAD_REQUEST, "Business information not found!");

		return { success: true, message: "Business information updated successfully", data };
	} catch (error) {
		if (error instanceof ApiError) throw error;
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Error updating business information: ${error.message}`);
	}
};

const deleteBusinessInfo = async (workspaceId, folderId, businessInfoId) => {
	try {
		const { error } = await supabase
			.from("folder_business_info")
			.delete()
			.eq("id", businessInfoId)
			.eq("folder_id", folderId);
		if (error) throw new ApiError(httpStatus.BAD_REQUEST, error.message);
		return { success: true, message: "Business information deleted successfully" };
	} catch (error) {
		if (error instanceof ApiError) throw error;
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Error deleting business information: ${error.message}`);
	}
};

// ─── Survey Info CRUD ────────────────────────────────────────────

const createSurveyInfo = async (workspaceId, folderId, surveyInfoArray) => {
	try {
		const { data: folder } = await supabase.from("folders").select("id").eq("id", folderId).eq("workspace_id", workspaceId).single();
		if (!folder) throw new ApiError(httpStatus.BAD_REQUEST, "Workspace or Folder not found!");

		const rows = surveyInfoArray.map((s) => ({
			folder_id: folderId,
			question: s.question,
			answer: s.answer,
		}));

		const { data, error } = await supabase
			.from("folder_survey_info")
			.insert(rows)
			.select();
		if (error) throw new ApiError(httpStatus.BAD_REQUEST, error.message);

		return { success: true, message: "Survey information created successfully", data };
	} catch (error) {
		if (error instanceof ApiError) throw error;
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Error creating survey information: ${error.message}`);
	}
};

const getSurveyInfo = async (workspaceId, folderId) => {
	try {
		const { data: folder } = await supabase.from("folders").select("id").eq("id", folderId).eq("workspace_id", workspaceId).single();
		if (!folder) throw new ApiError(httpStatus.BAD_REQUEST, "Workspace or Folder not found!");

		const { data } = await supabase
			.from("folder_survey_info")
			.select("*")
			.eq("folder_id", folderId);

		if (!data || data.length === 0) throw new ApiError(httpStatus.NOT_FOUND, "Survey information not found!");
		return data;
	} catch (error) {
		if (error instanceof ApiError) throw error;
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Error retrieving survey information: ${error.message}`);
	}
};

const updateSurveyInfo = async (workspaceId, folderId, body) => {
	try {
		const { data: folder } = await supabase.from("folders").select("id").eq("id", folderId).eq("workspace_id", workspaceId).single();
		if (!folder) throw new ApiError(httpStatus.BAD_REQUEST, "Workspace or Folder not found!");

		// Delete existing and re-insert
		await supabase.from("folder_survey_info").delete().eq("folder_id", folderId);

		const rows = body.map((s) => ({
			folder_id: folderId,
			question: s.question,
			answer: s.answer,
		}));

		const { data, error } = await supabase
			.from("folder_survey_info")
			.insert(rows)
			.select();
		if (error) throw new ApiError(httpStatus.BAD_REQUEST, error.message);

		return { success: true, message: "Survey information updated successfully", data };
	} catch (error) {
		if (error instanceof ApiError) throw error;
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Error updating survey information: ${error.message}`);
	}
};

const deleteSurveyInfo = async (workspaceId, folderId) => {
	try {
		const { data: folder } = await supabase.from("folders").select("id").eq("id", folderId).eq("workspace_id", workspaceId).single();
		if (!folder) throw new ApiError(httpStatus.BAD_REQUEST, "Workspace or Folder not found!");

		await supabase.from("folder_survey_info").delete().eq("folder_id", folderId);
		return { success: true, message: "Survey information deleted successfully" };
	} catch (error) {
		if (error instanceof ApiError) throw error;
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Error deleting survey information: ${error.message}`);
	}
};

// ─── Update Chat Metadata ────────────────────────────────────────

const updateAssistantChat = async (workspaceId, folderId, chatId, body) => {
	try {
		const mapped = {};
		if (body.chatTitle !== undefined) mapped.chat_title = body.chatTitle;
		if (body.version !== undefined) mapped.version = body.version;
		if (body.isSoftDeleted !== undefined) mapped.is_soft_deleted = body.isSoftDeleted;

		const { data, error } = await supabase
			.from("folder_chats")
			.update(mapped)
			.eq("id", chatId)
			.eq("folder_id", folderId)
			.select()
			.single();
		if (error || !data) throw new ApiError(httpStatus.BAD_REQUEST, "Workspace, Folder, or Chat not found!");

		return { success: true, message: "Assistant chat updated successfully", data };
	} catch (error) {
		if (error instanceof ApiError) throw error;
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Error updating assistant chat: ${error.message}`);
	}
};

// ─── Trash (Soft Delete / Restore / Permanent Delete) ────────────

const moveEntityToTrash = async (entityType, id) => {
	const handlers = {
		workspace: async () => {
			const { data: ws } = await supabase.from("workspaces").select("workspace_name").eq("id", id).single();
			if (!ws) throw new ApiError(httpStatus.NOT_FOUND, "Workspace not found");
			if (ws.workspace_name === "Default Workspace") {
				throw new ApiError(httpStatus.BAD_REQUEST, "Default workspace cannot be moved to trash!");
			}
			const { data } = await supabase.from("workspaces").update({ is_soft_deleted: true }).eq("id", id).select().single();
			return data;
		},
		folder: async () => {
			const { data: folder } = await supabase.from("folders").select("folder_name").eq("id", id).single();
			if (!folder) throw new ApiError(httpStatus.NOT_FOUND, "Folder not found");
			if (folder.folder_name === "Default Folder") {
				throw new ApiError(httpStatus.BAD_REQUEST, "Default folder cannot be moved to trash!");
			}
			const { data } = await supabase.from("folders").update({ is_soft_deleted: true }).eq("id", id).select().single();
			return data;
		},
		chat: async () => {
			const { data } = await supabase.from("folder_chats").update({ is_soft_deleted: true }).eq("id", id).select().single();
			return data;
		},
		assessment: async () => {
			const { data } = await supabase.from("folder_assessments").update({ is_soft_deleted: true }).eq("id", id).select().single();
			return data;
		},
	};

	const handler = handlers[entityType];
	if (!handler) throw new ApiError(httpStatus.BAD_REQUEST, "Invalid entity type");
	return await handler();
};

const restoreEntityFromTrash = async (entityType, id) => {
	switch (entityType) {
		case "workspace": {
			const { data } = await supabase.from("workspaces").update({ is_soft_deleted: false }).eq("id", id).select().single();
			return data;
		}
		case "folder": {
			const { data } = await supabase.from("folders").update({ is_soft_deleted: false }).eq("id", id).select().single();
			return data;
		}
		case "chat": {
			const { data } = await supabase.from("folder_chats").update({ is_soft_deleted: false }).eq("id", id).select().single();
			return data;
		}
		case "assessment": {
			const { data } = await supabase.from("folder_assessments").update({ is_soft_deleted: false }).eq("id", id).select().single();
			return data;
		}
		default:
			return null;
	}
};

const deleteEntityFromTrash = async (entityType, id) => {
	const handlers = {
		workspace: async () => {
			const { data: ws } = await supabase.from("workspaces").select("workspace_name").eq("id", id).single();
			if (!ws) throw new ApiError(httpStatus.NOT_FOUND, "Workspace not found");
			if (ws.workspace_name === "Default Workspace") {
				throw new ApiError(httpStatus.BAD_REQUEST, "Default workspace cannot be deleted!");
			}
			await supabase.from("workspaces").delete().eq("id", id);
			return { success: true };
		},
		folder: async () => {
			const { data: folder } = await supabase.from("folders").select("folder_name").eq("id", id).single();
			if (!folder) throw new ApiError(httpStatus.NOT_FOUND, "Folder not found");
			if (folder.folder_name === "Default Folder") {
				throw new ApiError(httpStatus.BAD_REQUEST, "Default folder cannot be deleted!");
			}
			await supabase.from("folders").delete().eq("id", id);
			return { success: true };
		},
		chat: async () => {
			await supabase.from("folder_chats").delete().eq("id", id);
			return { success: true };
		},
		assessment: async () => {
			await supabase.from("folder_assessments").delete().eq("id", id);
			return { success: true };
		},
	};

	const handler = handlers[entityType];
	if (!handler) throw new ApiError(httpStatus.BAD_REQUEST, "Invalid entity type");
	return await handler();
};

const getUserTrash = async (userId) => {
	// Get trashed workspaces
	const { data: trashedWorkspaces } = await supabase
		.from("workspaces")
		.select("id, workspace_name, workspace_description")
		.eq("user_id", userId)
		.eq("is_soft_deleted", true);

	// Get all workspace IDs for this user
	const { data: allWorkspaces } = await supabase
		.from("workspaces")
		.select("id")
		.eq("user_id", userId);
	const wsIds = (allWorkspaces || []).map((w) => w.id);

	// Get trashed folders
	const { data: trashedFolders } = wsIds.length
		? await supabase
				.from("folders")
				.select("id, folder_name")
				.in("workspace_id", wsIds)
				.eq("is_soft_deleted", true)
		: { data: [] };

	// Get all folder IDs
	const { data: allFolders } = wsIds.length
		? await supabase
				.from("folders")
				.select("id")
				.in("workspace_id", wsIds)
		: { data: [] };
	const folderIds = (allFolders || []).map((f) => f.id);

	// Get trashed chats
	const { data: trashedChats } = folderIds.length
		? await supabase
				.from("folder_chats")
				.select("id, chat_title")
				.in("folder_id", folderIds)
				.eq("is_soft_deleted", true)
		: { data: [] };

	// Get trashed assessments
	const { data: trashedAssessments } = folderIds.length
		? await supabase
				.from("folder_assessments")
				.select("id, name")
				.in("folder_id", folderIds)
				.eq("is_soft_deleted", true)
		: { data: [] };

	return {
		workspaces: (trashedWorkspaces || []).map((w) => ({
			workspaceName: w.workspace_name,
			workspaceDescription: w.workspace_description,
			_id: w.id,
		})),
		folders: (trashedFolders || []).map((f) => ({
			folderName: f.folder_name,
			_id: f.id,
		})),
		chats: (trashedChats || []).map((c) => ({
			chatTitle: c.chat_title,
			_id: c.id,
		})),
		assessments: (trashedAssessments || []).map((a) => ({
			assessmentTitle: a.name || "Assessment",
			_id: a.id,
		})),
	};
};

// ─── AI Proxy ────────────────────────────────────────────────────

const getChatFromAI = async (data) => {
	const gptURL = `${config.baseUrl}/chat`;
	const gptResponse = await makeAxiosCall({ url: gptURL, method: "POST", data: data });
	return gptResponse;
};

// ─── User Aggregation Queries ────────────────────────────────────

const getCommentsForUser = async (userId) => {
	const { data: comments } = await supabase
		.from("folder_chat_comments")
		.select(`
			*,
			chat:folder_chats(
				id, folder_id,
				folder:folders(id, workspace_id)
			)
		`)
		.eq("user_id", userId);

	return (comments || []).map((c) => ({
		workspaceId: c.chat?.folder?.workspace_id,
		folderId: c.chat?.folder_id,
		chatId: c.chat_id,
		messageId: c.message_id,
		comment: c,
	}));
};

const getUserChats = async (userId, query) => {
	// Build folder filter
	let folderQuery = supabase
		.from("folders")
		.select("id, workspace_id");

	if (query.workspaceId) {
		folderQuery = folderQuery.eq("workspace_id", query.workspaceId);
	} else {
		// Get workspace IDs for user
		const { data: workspaces } = await supabase
			.from("workspaces")
			.select("id")
			.eq("user_id", userId);
		if (!workspaces || workspaces.length === 0) {
			throw new ApiError(httpStatus.NOT_FOUND, "No workspaces found for this user");
		}
		folderQuery = folderQuery.in("workspace_id", workspaces.map((w) => w.id));
	}

	if (query.folderId) {
		folderQuery = folderQuery.eq("id", query.folderId);
	}

	const { data: folders } = await folderQuery;
	if (!folders || folders.length === 0) {
		throw new ApiError(httpStatus.NOT_FOUND, "No workspaces found for this user");
	}

	const folderIds = folders.map((f) => f.id);
	const folderMap = {};
	folders.forEach((f) => { folderMap[f.id] = f; });

	const { data: chats } = await supabase
		.from("folder_chats")
		.select("*")
		.in("folder_id", folderIds)
		.order("created_at", { ascending: false });

	// Auto-fix titles for chats still named "New Chat"
	const newChatIds = (chats || []).filter(c => c.chat_title === "New Chat").map(c => c.id);
	const firstMessages = {};
	if (newChatIds.length > 0) {
		for (const chatId of newChatIds) {
			const { data: msg } = await supabase
				.from("folder_chat_messages")
				.select("text")
				.eq("chat_id", chatId)
				.eq("from", "user")
				.order("created_at", { ascending: true })
				.limit(1)
				.maybeSingle();
			if (msg?.text) {
				const title = msg.text.substring(0, 60).replace(/\n/g, " ") + (msg.text.length > 60 ? "..." : "");
				firstMessages[chatId] = title;
				// Update in DB so this only happens once
				await supabase.from("folder_chats").update({ chat_title: title }).eq("id", chatId);
			}
		}
	}

	return (chats || []).map((chat) => ({
		...chat,
		_id: chat.id,
		workspaceId: folderMap[chat.folder_id]?.workspace_id,
		folderId: chat.folder_id,
		chatTitle: firstMessages[chat.id] || chat.chat_title,
		chatId: chat.id,
		isSoftDeleted: chat.is_soft_deleted,
		createdAt: chat.created_at,
		updatedAt: chat.updated_at,
	}));
};

const getUserSitemaps = async (userId, query) => {
	let folderQuery = supabase.from("folders").select("id, workspace_id");

	if (query.workspaceId) {
		folderQuery = folderQuery.eq("workspace_id", query.workspaceId);
	} else {
		const { data: workspaces } = await supabase.from("workspaces").select("id").eq("user_id", userId);
		if (!workspaces || workspaces.length === 0) throw new ApiError(httpStatus.NOT_FOUND, "No workspaces found for this user");
		folderQuery = folderQuery.in("workspace_id", workspaces.map((w) => w.id));
	}
	if (query.folderId) folderQuery = folderQuery.eq("id", query.folderId);

	const { data: folders } = await folderQuery;
	if (!folders || folders.length === 0) throw new ApiError(httpStatus.NOT_FOUND, "No workspaces found for this user");

	const folderIds = folders.map((f) => f.id);
	const folderMap = {};
	folders.forEach((f) => { folderMap[f.id] = f; });

	const { data: refs } = await supabase
		.from("folder_sitemap_references")
		.select("*, sitemap:sitemap_id(*)")
		.in("folder_id", folderIds);

	return (refs || []).map((r) => ({
		workspaceId: folderMap[r.folder_id]?.workspace_id,
		folderId: r.folder_id,
		...r.sitemap,
		_id: r.sitemap?.id,
		updatedAt: r.sitemap?.updated_at,
		createdAt: r.sitemap?.created_at,
	}));
};

const getUserAssessments = async (userId, query) => {
	let folderQuery = supabase.from("folders").select("id, workspace_id");

	if (query.workspaceId) {
		folderQuery = folderQuery.eq("workspace_id", query.workspaceId);
	} else {
		const { data: workspaces } = await supabase.from("workspaces").select("id").eq("user_id", userId);
		if (!workspaces || workspaces.length === 0) throw new ApiError(httpStatus.NOT_FOUND, "No workspaces found for this user");
		folderQuery = folderQuery.in("workspace_id", workspaces.map((w) => w.id));
	}
	if (query.folderId) folderQuery = folderQuery.eq("id", query.folderId);

	const { data: folders } = await folderQuery;
	if (!folders || folders.length === 0) throw new ApiError(httpStatus.NOT_FOUND, "No workspaces found for this user");

	const folderIds = folders.map((f) => f.id);
	const folderMap = {};
	folders.forEach((f) => { folderMap[f.id] = f; });

	const { data: assessments } = await supabase
		.from("folder_assessments")
		.select("*")
		.in("folder_id", folderIds);

	return (assessments || []).map((a) => ({
		workspaceId: folderMap[a.folder_id]?.workspace_id,
		folderId: a.folder_id,
		...a,
	}));
};

const getUserWireframes = async (userId, query) => {
	let folderQuery = supabase.from("folders").select("id, workspace_id");

	if (query.workspaceId) {
		folderQuery = folderQuery.eq("workspace_id", query.workspaceId);
	} else {
		const { data: workspaces } = await supabase.from("workspaces").select("id").eq("user_id", userId);
		if (!workspaces || workspaces.length === 0) throw new ApiError(httpStatus.NOT_FOUND, "No workspaces found for this user");
		folderQuery = folderQuery.in("workspace_id", workspaces.map((w) => w.id));
	}
	if (query.folderId) folderQuery = folderQuery.eq("id", query.folderId);

	const { data: folders } = await folderQuery;
	if (!folders || folders.length === 0) throw new ApiError(httpStatus.NOT_FOUND, "No workspaces found for this user");

	const folderIds = folders.map((f) => f.id);
	const folderMap = {};
	folders.forEach((f) => { folderMap[f.id] = f; });

	let wireframeQuery = supabase
		.from("folder_wireframes")
		.select("*")
		.in("folder_id", folderIds);

	if (query.wireframeId) wireframeQuery = wireframeQuery.eq("id", query.wireframeId);

	const { data: wireframes } = await wireframeQuery;

	return (wireframes || []).map((w) => ({
		workspaceId: folderMap[w.folder_id]?.workspace_id,
		folderId: w.folder_id,
		...w,
	}));
};

// ─── Sitemap Operations ─────────────────────────────────────────

const addSitemapToWorkspace = async (workspaceId, folderId, body) => {
	const { sitemapId } = body;

	const { data: folder } = await supabase.from("folders").select("id").eq("id", folderId).eq("workspace_id", workspaceId).single();
	if (!folder) throw new ApiError(httpStatus.BAD_REQUEST, "Folder not found!");

	await supabase.from("folder_sitemap_references").insert({
		folder_id: folderId,
		sitemap_id: sitemapId,
	});

	return { success: true, message: "Sitemap added successfully" };
};

const getSitemaps = async (workspaceId, folderId) => {
	const { data: folder } = await supabase.from("folders").select("id").eq("id", folderId).eq("workspace_id", workspaceId).single();
	if (!folder) throw new ApiError(httpStatus.BAD_REQUEST, "Folder not found!");

	const { data: refs } = await supabase
		.from("folder_sitemap_references")
		.select("sitemap_id")
		.eq("folder_id", folderId);

	if (!refs || refs.length === 0) return [];

	const sitemapIds = refs.map((r) => r.sitemap_id);
	const { data: sitemaps } = await supabase
		.from("digital_playbooks")
		.select("*")
		.in("id", sitemapIds);

	return sitemaps || [];
};

const getSitemap = async (workspaceId, folderId, sitemapId) => {
	const { data: folder } = await supabase.from("folders").select("id").eq("id", folderId).eq("workspace_id", workspaceId).single();
	if (!folder) throw new ApiError(httpStatus.BAD_REQUEST, "Folder not found!");

	const { data: sitemap } = await supabase
		.from("digital_playbooks")
		.select("*")
		.eq("id", sitemapId)
		.single();
	if (!sitemap) throw new ApiError(httpStatus.BAD_REQUEST, "Sitemap not found!");
	return sitemap;
};

// ─── Wireframe CRUD ──────────────────────────────────────────────

const createWireframe = async (workspaceId, folderId, body) => {
	const { sitemapId, title } = body;

	const { data: workspace } = await supabase.from("workspaces").select("user_id").eq("id", workspaceId).single();
	if (!workspace) throw new ApiError(httpStatus.BAD_REQUEST, "Workspace or Folder not found!");

	const { data: folder } = await supabase.from("folders").select("id").eq("id", folderId).eq("workspace_id", workspaceId).single();
	if (!folder) throw new ApiError(httpStatus.BAD_REQUEST, "Folder not found!");

	const { data: sitemap } = await supabase.from("digital_playbooks").select("*").eq("id", sitemapId).single();
	if (!sitemap) throw new ApiError(httpStatus.BAD_REQUEST, "Sitemap not found!");

	const initialBody = {
		user_id: workspace.user_id,
		message: sitemap.message,
		wireframe_name: title,
		sitemap_body: sitemap,
	};
	const gptResponse = await axios.post(`${config.baseUrl}/wireframe`, initialBody);
	const response = gptResponse.data;

	const parsedMessage = parseJsonIfPossible(response.message);
	const wireframeNameArray = parsedMessage[title];
	const updatedWireframeLayout = assignPageAndLayoutIndexes(wireframeNameArray, 4, 4);

	// Create wireframe
	const { data: wireframe, error: wfErr } = await supabase
		.from("folder_wireframes")
		.insert({
			folder_id: folderId,
			sitemap_id: sitemapId,
			title,
		})
		.select()
		.single();
	if (wfErr) throw new ApiError(httpStatus.BAD_REQUEST, wfErr.message);

	// Create entities
	if (isArrayWithLength(updatedWireframeLayout)) {
		const entityRows = updatedWireframeLayout.map((e) => ({
			wireframe_id: wireframe.id,
			element: e.element,
			layout: e.layout,
			text: e.text,
			description: e.description,
			image: e.image,
			type: e.type,
			chart_type: e.chartType,
			page_index: e.pageIndex,
			layout_index: e.layoutIndex,
			styles: e.styles || null,
			description_styles: e.descriptionStyles || null,
			table_data: e.tableData || null,
			chart_data: e.chartData || null,
		}));
		await supabase.from("folder_wireframe_entities").insert(entityRows);
	}

	// Fetch complete wireframe with entities
	const { data: fullWireframe } = await supabase
		.from("folder_wireframes")
		.select("*, entities:folder_wireframe_entities(*)")
		.eq("id", wireframe.id)
		.single();

	return {
		success: true,
		message: "Wireframe created successfully",
		data: fullWireframe,
	};
};

const getWireframes = async (workspaceId, folderId) => {
	const { data: folder } = await supabase.from("folders").select("id").eq("id", folderId).eq("workspace_id", workspaceId).single();
	if (!folder) throw new ApiError(httpStatus.BAD_REQUEST, "Folder not found!");

	const { data: wireframes } = await supabase
		.from("folder_wireframes")
		.select("*")
		.eq("folder_id", folderId);
	return wireframes || [];
};

const getWireframe = async (workspaceId, folderId, wireframeId) => {
	const { data: wireframe } = await supabase
		.from("folder_wireframes")
		.select(`
			*,
			entities:folder_wireframe_entities(
				*,
				elements:folder_wireframe_elements(*),
				shapes:folder_wireframe_shapes(*)
			),
			comments:folder_wireframe_comments(*)
		`)
		.eq("id", wireframeId)
		.eq("folder_id", folderId)
		.single();
	if (!wireframe) throw new ApiError(httpStatus.BAD_REQUEST, "Wireframe not found!");
	return wireframe;
};

const updateWireframe = async (workspaceId, folderId, wireframeId, body) => {
	const mapped = {};
	if (body.title !== undefined) mapped.title = body.title;
	if (body.sitemapId !== undefined) mapped.sitemap_id = body.sitemapId;

	const { data, error } = await supabase
		.from("folder_wireframes")
		.update(mapped)
		.eq("id", wireframeId)
		.eq("folder_id", folderId)
		.select()
		.single();
	if (error || !data) throw new ApiError(httpStatus.BAD_REQUEST, "Wireframe not found!");

	return { success: true, message: "Wireframe updated successfully", data };
};

const deleteWireframe = async (workspaceId, folderId, wireframeId) => {
	const { data: wf } = await supabase.from("folder_wireframes").select("id").eq("id", wireframeId).eq("folder_id", folderId).single();
	if (!wf) throw new ApiError(httpStatus.BAD_REQUEST, "Wireframe not found!");

	await supabase.from("folder_wireframes").delete().eq("id", wireframeId);
	return { success: true, message: "Wireframe deleted successfully" };
};

// ─── Wireframe Entity CRUD ───────────────────────────────────────

const createWireframeEntity = async (workspaceId, folderId, wireframeId, body) => {
	const { data: wf } = await supabase.from("folder_wireframes").select("id").eq("id", wireframeId).eq("folder_id", folderId).single();
	if (!wf) throw new ApiError(httpStatus.BAD_REQUEST, "Wireframe not found!");

	const { data, error } = await supabase
		.from("folder_wireframe_entities")
		.insert({
			wireframe_id: wireframeId,
			element: body.element,
			layout: body.layout,
			text: body.text,
			description: body.description,
			image: body.image,
			type: body.type,
			chart_type: body.chartType,
			page_index: body.pageIndex,
			layout_index: body.layoutIndex,
			styles: body.styles || null,
			description_styles: body.descriptionStyles || null,
			table_data: body.tableData || null,
			chart_data: body.chartData || null,
		})
		.select()
		.single();
	if (error) throw new ApiError(httpStatus.BAD_REQUEST, error.message);

	return { success: true, message: "Wireframe entity created successfully", data };
};

const bulkCreateWireframeEntity = async (workspaceId, folderId, wireframeId, body) => {
	const { data: wf } = await supabase.from("folder_wireframes").select("id").eq("id", wireframeId).eq("folder_id", folderId).single();
	if (!wf) throw new ApiError(httpStatus.BAD_REQUEST, "Wireframe not found!");

	const rows = body.map((e) => ({
		wireframe_id: wireframeId,
		element: e.element,
		layout: e.layout,
		text: e.text,
		description: e.description,
		image: e.image,
		type: e.type,
		chart_type: e.chartType,
		page_index: e.pageIndex,
		layout_index: e.layoutIndex,
		styles: e.styles || null,
		description_styles: e.descriptionStyles || null,
		table_data: e.tableData || null,
		chart_data: e.chartData || null,
	}));

	const { data, error } = await supabase
		.from("folder_wireframe_entities")
		.insert(rows)
		.select();
	if (error) throw new ApiError(httpStatus.BAD_REQUEST, error.message);

	return { success: true, message: "Wireframe entities created successfully", data };
};

const bulkUpdateWireframeEntity = async (workspaceId, folderId, wireframeId, body) => {
	const { data: wf } = await supabase.from("folder_wireframes").select("id").eq("id", wireframeId).eq("folder_id", folderId).single();
	if (!wf) throw new ApiError(httpStatus.BAD_REQUEST, "Wireframe not found!");

	const updatedEntities = [];
	for (const entity of body) {
		const mapped = {};
		if (entity.element !== undefined) mapped.element = entity.element;
		if (entity.layout !== undefined) mapped.layout = entity.layout;
		if (entity.text !== undefined) mapped.text = entity.text;
		if (entity.description !== undefined) mapped.description = entity.description;
		if (entity.image !== undefined) mapped.image = entity.image;
		if (entity.type !== undefined) mapped.type = entity.type;
		if (entity.chartType !== undefined) mapped.chart_type = entity.chartType;
		if (entity.pageIndex !== undefined) mapped.page_index = entity.pageIndex;
		if (entity.layoutIndex !== undefined) mapped.layout_index = entity.layoutIndex;
		if (entity.styles !== undefined) mapped.styles = entity.styles;
		if (entity.descriptionStyles !== undefined) mapped.description_styles = entity.descriptionStyles;
		if (entity.tableData !== undefined) mapped.table_data = entity.tableData;
		if (entity.chartData !== undefined) mapped.chart_data = entity.chartData;

		const { data } = await supabase
			.from("folder_wireframe_entities")
			.update(mapped)
			.eq("id", entity.id)
			.eq("wireframe_id", wireframeId)
			.select()
			.single();
		if (data) updatedEntities.push(data);
	}

	return { success: true, message: "Wireframe entities updated successfully", data: updatedEntities };
};

const bulkDeleteWireframeEntity = async (workspaceId, folderId, wireframeId, entityIds) => {
	const { data: wf } = await supabase.from("folder_wireframes").select("id").eq("id", wireframeId).eq("folder_id", folderId).single();
	if (!wf) throw new ApiError(httpStatus.BAD_REQUEST, "Wireframe not found!");

	await supabase
		.from("folder_wireframe_entities")
		.delete()
		.in("id", entityIds)
		.eq("wireframe_id", wireframeId);

	return { success: true, message: "Wireframe entities deleted successfully" };
};

const updateWireframeEntity = async (workspaceId, folderId, wireframeId, entityId, body) => {
	const mapped = {};
	if (body.element !== undefined) mapped.element = body.element;
	if (body.layout !== undefined) mapped.layout = body.layout;
	if (body.text !== undefined) mapped.text = body.text;
	if (body.description !== undefined) mapped.description = body.description;
	if (body.image !== undefined) mapped.image = body.image;
	if (body.type !== undefined) mapped.type = body.type;
	if (body.chartType !== undefined) mapped.chart_type = body.chartType;
	if (body.pageIndex !== undefined) mapped.page_index = body.pageIndex;
	if (body.layoutIndex !== undefined) mapped.layout_index = body.layoutIndex;
	if (body.styles !== undefined) mapped.styles = body.styles;
	if (body.descriptionStyles !== undefined) mapped.description_styles = body.descriptionStyles;
	if (body.tableData !== undefined) mapped.table_data = body.tableData;
	if (body.chartData !== undefined) mapped.chart_data = body.chartData;

	const { data, error } = await supabase
		.from("folder_wireframe_entities")
		.update(mapped)
		.eq("id", entityId)
		.eq("wireframe_id", wireframeId)
		.select()
		.single();
	if (error || !data) throw new ApiError(httpStatus.BAD_REQUEST, "Entity not found!");

	return { success: true, message: "Wireframe entity updated successfully", data };
};

const deleteWireframeEntity = async (workspaceId, folderId, wireframeId, entityId) => {
	const { data } = await supabase
		.from("folder_wireframe_entities")
		.select("id")
		.eq("id", entityId)
		.eq("wireframe_id", wireframeId)
		.single();
	if (!data) throw new ApiError(httpStatus.BAD_REQUEST, "Entity not found!");

	await supabase.from("folder_wireframe_entities").delete().eq("id", entityId);
	return { success: true, message: "Wireframe entity deleted successfully" };
};

const uploadEntityImage = async (workspaceId, folderId, wireframeId, entityId, file) => {
	const { data, error } = await supabase
		.from("folder_wireframe_entities")
		.update({ image: file.filename })
		.eq("id", entityId)
		.eq("wireframe_id", wireframeId)
		.select()
		.single();
	if (error || !data) throw new ApiError(httpStatus.BAD_REQUEST, "Entity not found!");

	return {
		success: true,
		message: "Wireframe entity image uploaded successfully",
		data,
		image: file.filename,
	};
};

// ─── Assessment Report Generation ────────────────────────────────

const generateAssessmentReport = async (workspaceId, folderId, assessmentId) => {
	const { data: workspace } = await supabase.from("workspaces").select("user_id").eq("id", workspaceId).single();
	if (!workspace) throw new ApiError(httpStatus.BAD_REQUEST, "Workspace not found!");

	const { data: assessment } = await supabase
		.from("folder_assessments")
		.select("id, name")
		.eq("id", assessmentId)
		.eq("folder_id", folderId)
		.single();
	if (!assessment) throw new ApiError(httpStatus.BAD_REQUEST, "Assessment not found!");

	// Get report and sub-report title
	const { data: report } = await supabase
		.from("folder_assessment_reports")
		.select("id, report_title, folder_assessment_sub_reports(report_title)")
		.eq("assessment_id", assessmentId)
		.order("created_at", { ascending: true })
		.limit(1)
		.single();

	const assessmentTitle = report?.folder_assessment_sub_reports?.[0]?.report_title || assessment.name;

	// Get survey & business info for the folder
	const { data: surveyInfo } = await supabase.from("folder_survey_info").select("*").eq("folder_id", folderId);
	const { data: businessInfo } = await supabase.from("folder_business_info").select("*").eq("folder_id", folderId);

	const surveyInfoToString = formatQuestionsToString(surveyInfo || []);

	const reportPayload = {
		user_id: workspace.user_id,
		chat_id: assessmentId,
		assessment_name: assessmentTitle,
		general_info: surveyInfoToString,
		business_info: businessInfo || [],
	};

	const gptURL = `${config.baseUrl}/generate_all_report`;
	const gptResponse = await makeAxiosCall({ url: gptURL, method: "POST", data: reportPayload });
	if (!gptResponse) throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, "Error generating assessment report");

	const pdfFileName = `${Date.now()}_assessment_report.pdf`;
	const pdfFilePath = path.resolve(process.cwd(), "public/uploads", pdfFileName);
	convertMarkdownToPDF(gptResponse.message, pdfFilePath);

	await supabase.from("folder_assessment_reports").update({
		report_title: gptResponse.title,
		final_report: gptResponse.message,
		final_report_url: `/uploads/${pdfFileName}`,
	}).eq("id", report.id);

	return {
		success: true,
		message: "Assessment report generated successfully",
		report: {
			ReportTitle: gptResponse.title,
			finalReport: gptResponse.message,
			finalReportURL: `${config.rootPath}/${pdfFileName}`,
		},
	};
};

const generateAssessmentReports = async (workspaceId, folderId) => {
	const { data: workspace } = await supabase.from("workspaces").select("user_id").eq("id", workspaceId).single();
	if (!workspace) throw new ApiError(httpStatus.BAD_REQUEST, "Workspace not found!");

	const { data: assessments } = await supabase
		.from("folder_assessments")
		.select("id, name")
		.eq("folder_id", folderId);
	if (!isArrayWithLength(assessments)) throw new ApiError(httpStatus.BAD_REQUEST, "Assessments not found!");

	const { data: surveyInfo } = await supabase.from("folder_survey_info").select("*").eq("folder_id", folderId);
	const { data: businessInfo } = await supabase.from("folder_business_info").select("*").eq("folder_id", folderId);
	const surveyInfoToString = formatQuestionsToString(surveyInfo || []);

	for (const assessment of assessments) {
		const { data: report } = await supabase
			.from("folder_assessment_reports")
			.select("id, folder_assessment_sub_reports(report_title)")
			.eq("assessment_id", assessment.id)
			.order("created_at", { ascending: true })
			.limit(1)
			.maybeSingle();

		const assessmentTitle = report?.folder_assessment_sub_reports?.[0]?.report_title;
		if (!assessmentTitle) continue;

		const reportPayload = {
			user_id: workspace.user_id,
			chat_id: assessment.id,
			assessment_name: assessmentTitle,
			general_info: surveyInfoToString,
			business_info: businessInfo || [],
		};

		const gptURL = `${config.baseUrl}/generate_all_report`;
		const gptResponse = await makeAxiosCall({ url: gptURL, method: "POST", data: reportPayload });
		if (!gptResponse) break;

		const pdfFileName = `${Date.now()}_assessment_report.pdf`;
		const pdfFilePath = path.resolve(process.cwd(), "public/uploads", pdfFileName);
		convertMarkdownToPDF(gptResponse.message, pdfFilePath);

		await supabase.from("folder_assessment_reports").update({
			report_title: gptResponse.title,
			final_report: gptResponse.message,
			final_report_url: `/uploads/${pdfFileName}`,
		}).eq("id", report.id);
	}

	return {
		success: true,
		message: "Assessment reports generated successfully",
		data: assessments,
	};
};

// ─── Default Workspace ───────────────────────────────────────────

const createDefaultWorkspace = async (userId) => {
	const { data: existing } = await supabase
		.from("workspaces")
		.select("*")
		.eq("user_id", userId)
		.eq("workspace_name", "Default Workspace")
		.maybeSingle();

	if (existing) return existing;

	const { data: workspace, error } = await supabase
		.from("workspaces")
		.insert({
			user_id: userId,
			workspace_name: "Default Workspace",
			workspace_description: "This is your default workspace",
			is_active: true,
		})
		.select()
		.single();
	if (error) throw new ApiError(httpStatus.BAD_REQUEST, error.message);

	// Create default folder
	await supabase.from("folders").insert({
		workspace_id: workspace.id,
		folder_name: "Default Folder",
		is_active: true,
	});

	return workspace;
};

// ─── Dashboard Stats ─────────────────────────────────────────────

const getUserDashboardStats = async (userId) => {
	// Get non-deleted workspaces
	const { data: workspaces } = await supabase
		.from("workspaces")
		.select("id, workspace_name, workspace_description, is_active")
		.eq("user_id", userId)
		.eq("is_soft_deleted", false);

	if (!workspaces) return { activeWorkspace: "No Active Workspace", activeProject: "No Active Project", activeSubscription: "Free", totalWorkspaces: 0, totalProjects: 0, workspaces: [] };

	const wsIds = workspaces.map((w) => w.id);

	// Get non-deleted folders
	const { data: folders } = wsIds.length
		? await supabase
				.from("folders")
				.select("id, workspace_id, folder_name, is_active")
				.in("workspace_id", wsIds)
				.eq("is_soft_deleted", false)
		: { data: [] };

	const activeWorkspace = workspaces.find((w) => w.is_active);
	const totalWorkspaces = workspaces.length;

	const activeFolders = (folders || []).filter((f) => f.workspace_id === activeWorkspace?.id);
	const activeProject = activeFolders.find((f) => f.is_active);
	const totalProjects = (folders || []).length;

	// Build workspace details with folders
	const foldersByWs = {};
	(folders || []).forEach((f) => {
		if (!foldersByWs[f.workspace_id]) foldersByWs[f.workspace_id] = [];
		foldersByWs[f.workspace_id].push({
			id: f.id,
			folderName: f.folder_name,
			isActive: f.is_active,
		});
	});

	const workspaceDetails = workspaces.map((w) => ({
		id: w.id,
		workspaceName: w.workspace_name,
		workspaceDescription: w.workspace_description,
		isActive: w.is_active,
		folders: foldersByWs[w.id] || [],
	}));

	return {
		activeWorkspace: activeWorkspace?.workspace_name || "No Active Workspace",
		activeProject: activeProject?.folder_name || "No Active Project",
		activeSubscription: "Free",
		totalWorkspaces,
		totalProjects,
		workspaces: workspaceDetails,
	};
};

// ─── Folder Entities (Dashboard Summary) ─────────────────────────

const getFolderEntities = async (workspaceId, folderId) => {
	// Verify workspace & folder
	const { data: ws } = await supabase.from("workspaces").select("workspace_name").eq("id", workspaceId).eq("is_soft_deleted", false).single();
	if (!ws) return [];

	const { data: folder } = await supabase.from("folders").select("id, folder_name").eq("id", folderId).eq("workspace_id", workspaceId).eq("is_soft_deleted", false).single();
	if (!folder) return [];

	// Get latest 5 chats (non-deleted)
	const { data: chats } = await supabase
		.from("folder_chats")
		.select("id, chat_title, created_at")
		.eq("folder_id", folderId)
		.eq("is_soft_deleted", false)
		.order("created_at", { ascending: false })
		.limit(5);

	// Get latest 5 assessments (non-deleted)
	const { data: assessments } = await supabase
		.from("folder_assessments")
		.select("id, name, created_at")
		.eq("folder_id", folderId)
		.eq("is_soft_deleted", false)
		.order("created_at", { ascending: false })
		.limit(5);

	// Get latest 5 wireframes
	const { data: wireframes } = await supabase
		.from("folder_wireframes")
		.select("id, title, created_at")
		.eq("folder_id", folderId)
		.order("created_at", { ascending: false })
		.limit(5);

	// Get latest 5 sitemaps
	const { data: sitemapRefs } = await supabase
		.from("folder_sitemap_references")
		.select("sitemap_id")
		.eq("folder_id", folderId)
		.order("created_at", { ascending: false })
		.limit(5);

	let sitemaps = [];
	if (sitemapRefs && sitemapRefs.length > 0) {
		const sitemapIds = sitemapRefs.map((r) => r.sitemap_id);
		const { data: sitemapData } = await supabase
			.from("digital_playbooks")
			.select("id, name, created_at")
			.in("id", sitemapIds);
		sitemaps = (sitemapData || []).map((s) => ({ id: s.id, name: s.name, createdAt: s.created_at }));
	}

	return [{
		workspaceName: ws.workspace_name,
		folderName: folder.folder_name,
		chats: (chats || []).map((c) => ({ id: c.id, chatTitle: c.chat_title, createdAt: c.created_at })),
		assessments: (assessments || []).map((a) => ({ id: a.id, name: a.name || "Assessment", createdAt: a.created_at })),
		wireframes: (wireframes || []).map((w) => ({ id: w.id, title: w.title, createdAt: w.created_at })),
		sitemaps,
	}];
};

// ─── Message Reactions (Like / Dislike) ──────────────────────────

const toggleMessageLike = async (workspaceId, folderId, chatId, messageId, userId) => {
	// Check for existing reaction
	const { data: existing } = await supabase
		.from("chat_message_reactions")
		.select("id, type")
		.eq("message_id", messageId)
		.eq("user_id", userId)
		.maybeSingle();

	if (existing) {
		if (existing.type === "like") {
			// Remove reaction
			await supabase.from("chat_message_reactions").delete().eq("id", existing.id);
		} else {
			// Change to like
			await supabase.from("chat_message_reactions").update({ type: "like" }).eq("id", existing.id);
		}
	} else {
		// Insert new like
		await supabase.from("chat_message_reactions").insert({
			message_id: messageId,
			user_id: userId,
			type: "like",
		});
	}

	// Get message with updated reactions
	const { data: message } = await supabase
		.from("folder_chat_messages")
		.select("*, reactions:chat_message_reactions(*)")
		.eq("id", messageId)
		.single();

	return { success: true, message: "Reaction updated", data: message };
};

const toggleMessageDislike = async (workspaceId, folderId, chatId, messageId, userId) => {
	const { data: existing } = await supabase
		.from("chat_message_reactions")
		.select("id, type")
		.eq("message_id", messageId)
		.eq("user_id", userId)
		.maybeSingle();

	if (existing) {
		if (existing.type === "dislike") {
			await supabase.from("chat_message_reactions").delete().eq("id", existing.id);
		} else {
			await supabase.from("chat_message_reactions").update({ type: "dislike" }).eq("id", existing.id);
		}
	} else {
		await supabase.from("chat_message_reactions").insert({
			message_id: messageId,
			user_id: userId,
			type: "dislike",
		});
	}

	const { data: message } = await supabase
		.from("folder_chat_messages")
		.select("*, reactions:chat_message_reactions(*)")
		.eq("id", messageId)
		.single();

	return { success: true, message: "Reaction updated", data: message };
};

// ─── Move Chat Between Folders ───────────────────────────────────

const moveChatToFolderOfSameWorkspace = async (workspaceId, sourceFolderId, chatId, newFolderId) => {
	// Verify source folder and chat
	const { data: chat } = await supabase
		.from("folder_chats")
		.select("id")
		.eq("id", chatId)
		.eq("folder_id", sourceFolderId)
		.single();
	if (!chat) throw new ApiError(httpStatus.NOT_FOUND, "Workspace, Folder, or Chat not found");

	// Verify target folder exists in same workspace
	const { data: targetFolder } = await supabase
		.from("folders")
		.select("id")
		.eq("id", newFolderId)
		.eq("workspace_id", workspaceId)
		.single();
	if (!targetFolder) throw new ApiError(httpStatus.NOT_FOUND, "Target folder not found in workspace");

	// Move chat by updating folder_id
	await supabase.from("folder_chats").update({ folder_id: newFolderId }).eq("id", chatId);

	return { success: true, message: "Chat moved successfully" };
};

// ─── Exports ─────────────────────────────────────────────────────

module.exports = {
	create,
	query,
	get,
	update,
	deleteWorkspace,
	createFolder,
	updateFolder,
	deleteFolder,
	assistantChat,
	getFolderChats,
	getAssistantChat,
	shareChat,
	acceptChatInvite,
	assistantChatUpdate,
	updateMessageText,
	deleteAssistantChat,
	getChatMedia,
	getChatLinks,
	getChatDocuments,
	createComment,
	updateComment,
	getUserChatComments,
	deleteComment,
	bookmarkMessage,
	unbookmarkMessage,
	getBookmarksForChat,
	getBookmarksForUser,
	addReplyToComment,
	updateReplyInComment,
	createAssessment,
	updateAssessment,
	getAssessment,
	deleteAssessment,
	createBusinessInfo,
	getBusinessInfo,
	updateBusinessInfo,
	deleteBusinessInfo,
	createSurveyInfo,
	getSurveyInfo,
	updateSurveyInfo,
	deleteSurveyInfo,
	updateAssistantChat,
	moveEntityToTrash,
	restoreEntityFromTrash,
	deleteEntityFromTrash,
	getUserTrash,
	getCommentsForUser,
	getUserChats,
	getUserAssessments,
	getUserSitemaps,
	getUserWireframes,
	addSitemapToWorkspace,
	getSitemaps,
	getSitemap,
	createWireframe,
	getWireframes,
	getWireframe,
	updateWireframe,
	deleteWireframe,
	createWireframeEntity,
	bulkCreateWireframeEntity,
	bulkUpdateWireframeEntity,
	bulkDeleteWireframeEntity,
	updateWireframeEntity,
	deleteWireframeEntity,
	generateAssessmentReport,
	generateAssessmentReports,
	uploadEntityImage,
	createDefaultWorkspace,
	getUserDashboardStats,
	getFolderEntities,
	toggleMessageLike,
	toggleMessageDislike,
	moveChatToFolderOfSameWorkspace,
};
