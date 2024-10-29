const httpStatus = require("http-status");
const ApiError = require("../../utils/ApiError");
const Workspace = require("./entity/modal");
const { default: axios } = require("axios");
const path = require("path");
const config = require("../../config/config");
const { convertMarkdownToPdf, convertMarkdownToPDF } = require("../../utils/markdownToPDF");
const User = require("../users/entity/model");
const { sendInviteEmail } = require("../../utils/emailService");
const jwt = require("jsonwebtoken");
const {
	makeAxiosCall,
	isArrayWithLength,
	deepMerge,
	parseJsonIfPossible,
	ObjectID,
} = require("../../common/global.functions");
const DigitalPlaybook = require("../digitalPlaybook/entity/modal");
const { assignPageAndLayoutIndexes, formatQuestionsToString } = require("./helper");

const create = async (body) => {
	const doc = await Workspace.create(body);
	if (!doc) throw new ApiError(httpStatus.BAD_REQUEST, "something went wrong!");
	return doc;
};
const query = async (filter, options) => {
	return await Workspace.paginate(filter, options);
};
const get = async (id) => {
	const doc = await Workspace.findOne({ _id: id, isSoftDeleted: false });
	if (!doc) throw new ApiError(httpStatus.BAD_REQUEST, "No workspace found!");
	return doc;
};
const update = async (id, updateBody) => {
	const doc = await Workspace.findOne({ _id: id });
	if (!doc) throw new ApiError(httpStatus.BAD_REQUEST, "No workspace found!");
	Object.assign(doc, updateBody);
	await doc.save();
	return doc;
};
const deleteWorkspace = async (id) => {
	const doc = await Workspace.findOne({ _id: id });
	if (!doc) throw new ApiError(httpStatus.BAD_REQUEST, "No workspace found!");
	if (doc.workspaceName === "Default Workspace")
		throw new ApiError(httpStatus.BAD_REQUEST, "Cannot delete Default workspace!");
	await doc.remove();
	return { success: true, message: "Workspace deleted successfully" };
};
const createFolder = async (workspaceId, folder) => {
	try {
		const workspace = await Workspace.findById(workspaceId);
		if (!workspace) throw new ApiError(httpStatus.BAD_REQUEST, "Workspace not found!");

		workspace.folders.push(folder);
		await workspace.save();

		const folders = workspace.folders;
		return workspace.folders[folders.length - 1];
	} catch (error) {
		console.error("Error creating folder:", error);
		throw new ApiError(httpStatus.BAD_REQUEST, `Error creating folder: ${error.message}`);
	}
};
const updateFolder = async (workspaceId, folderId, updateBody) => {
	try {
		// Find the workspace and folder
		const workspace = await Workspace.findOne({
			_id: workspaceId,
			"folders._id": folderId,
		});
		if (!workspace) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Workspace or Folder not found!");
		}

		// Find the specific folder
		const folder = workspace.folders.id(folderId);
		Object.assign(folder, updateBody);
		await workspace.save();

		return folder;
	} catch (error) {
		console.error("Error updating folder:", error);
		throw new ApiError(httpStatus.BAD_REQUEST, `Error updating folder: ${error.message}`);
	}
};
const deleteFolder = async (workspaceId, folderId) => {
	try {
		const updatedWorkspace = await Workspace.findOneAndUpdate(
			{
				_id: workspaceId,
				"folders._id": folderId,
			},
			{
				$pull: {
					folders: { _id: folderId },
				},
			},
			{ new: true },
		);

		if (!updatedWorkspace) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Workspace or Folder not found!");
		}

		return { success: true, message: "Folder deleted successfully" };
	} catch (error) {
		throw new ApiError(httpStatus.BAD_REQUEST, `Error deleting folder: ${error.message}`);
	}
};
const assistantChat = async (workspaceId, folderId) => {
	try {
		// Find the workspace and folder
		const workspace = await Workspace.findOne({
			_id: workspaceId,
			"folders._id": folderId,
		});
		if (!workspace) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Workspace or Folder not found!");
		}
		const chat = {
			chatTitle: "New Chat",
		};
		const result = await Workspace.findOneAndUpdate(
			{ _id: workspaceId, "folders._id": folderId },
			{ $push: { "folders.$.chats": chat } },
			{ new: true },
		);
		return result;
	} catch (error) {
		throw new Error(`Error creating chat: ${error.message}`);
	}
};
const getAssistantChat = async (workspaceId, folderId, chatId) => {
	try {
		const workspace = await Workspace.findOne({
			_id: workspaceId,
			"folders._id": folderId,
			"folders.chats._id": chatId,
		});

		if (!workspace) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Workspace, Folder, or chat not found!");
		}

		const folder = workspace.folders.find((folder) => folder._id.toString() === folderId);
		if (!folder) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Folder not found!");
		}

		const chat = folder.chats.find((chat) => chat._id.toString() === chatId);
		if (!chat) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Chat not found!");
		}

		if (chat.isSoftDeleted) {
			throw new ApiError(httpStatus.NOT_FOUND, "Chat is soft-deleted and not available.");
		}

		return chat;
	} catch (error) {
		throw new ApiError(httpStatus.BAD_REQUEST, `Error retrieving chat: ${error.message}`);
	}
};
const generateInviteLink = (workspaceId, folderId, chatId, email) => {
	const inviteToken = jwt.sign(
		{ workspaceId, folderId, chatId, email },
		process.env.JWT_SECRET,
		{ expiresIn: "7d" }, // Token is valid for 7 days
	);

	const inviteLink = `${config.frontendUrl}/invite?token=${inviteToken}`;
	return inviteLink;
};
const shareChat = async (workspaceId, folderId, chatId, userIdToShare) => {
	const workspace = await Workspace.findOne({
		_id: workspaceId,
		"folders._id": folderId,
		"folders.chats._id": chatId,
	});

	if (!workspace) {
		throw new ApiError(httpStatus.NOT_FOUND, "Workspace, Folder, or Chat not found!");
	}

	const chat = workspace.folders.id(folderId).chats.id(chatId);

	if (!chat) {
		throw new ApiError(httpStatus.NOT_FOUND, "Chat not found!");
	}

	if (chat.sharedUsers.includes(userIdToShare)) {
		throw new ApiError(httpStatus.BAD_REQUEST, "User already has access to this chat.");
	}

	const user = await User.findById(userIdToShare);
	const inviteLink = await generateInviteLink(workspaceId, folderId, chatId, user.email);

	await sendInviteEmail(user.email, inviteLink);
	// chat.sharedUsers.push(userIdToShare);

	await workspace.save();
	await User.findByIdAndUpdate(userIdToShare, {
		$push: {
			sharedChats: { workspaceId, folderId, chatId },
		},
	});

	return chat;
};
const acceptChatInvite = async (token) => {
	try {
		const decoded = jwt.verify(token, config.jwt.secret);

		const { workspaceId, folderId, chatId, email } = decoded;
		const user = await User.findOne({ email });

		if (!user) {
			throw new ApiError(httpStatus.BAD_REQUEST, "User not found");
		}

		// Find the workspace first to locate the folder and chat
		const workspace = await Workspace.findOne({
			_id: workspaceId,
			"folders._id": folderId,
			"folders.chats._id": chatId,
		});

		if (!workspace) {
			throw new ApiError(httpStatus.NOT_FOUND, "Workspace or chat not found");
		}

		// Use the positional operator to target the correct folder
		const folderIndex = workspace.folders.findIndex((folder) => folder._id.toString() === folderId);

		const chatIndex = workspace.folders[folderIndex].chats.findIndex((chat) => chat._id.toString() === chatId);

		if (chatIndex === -1) {
			throw new ApiError(httpStatus.NOT_FOUND, "Chat not found");
		}

		// Push the user to the sharedUsers array
		workspace.folders[folderIndex].chats[chatIndex].sharedUsers.push({
			userId: user._id,
		});

		// Save the workspace with the updated shared users
		await workspace.save();

		// Retrieve the updated chat to return
		const updatedChat = workspace.folders[folderIndex].chats[chatIndex];

		// Return the updated chat
		return { success: true, chat: updatedChat };
	} catch (error) {
		console.log("error:", error);

		throw new ApiError(httpStatus.BAD_REQUEST, `Error accepting invite: ${error.message}`);
	}
};
const deleteAssistantChat = async (workspaceId, folderId, chatId) => {
	try {
		const workspace = await Workspace.findOne({
			_id: workspaceId,
			"folders._id": folderId,
			"folders.chats._id": chatId,
		});

		if (!workspace) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Workspace, Folder, or Chat not found!");
		}

		const folder = workspace.folders.id(folderId);

		if (!folder) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Folder not found!");
		}

		const chat = folder.chats.id(chatId);

		if (!chat) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Chat not found!");
		}

		if (chat.isSoftDeleted) {
			chat.remove();
			await workspace.save();

			return {
				success: true,
				message: "Chat permanently deleted",
			};
		} else {
			chat.isSoftDeleted = true;
			await workspace.save();

			return {
				success: true,
				message: "Chat soft deleted. Please make another request to permanently delete.",
			};
		}
	} catch (error) {
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Error deleting chat: ${error.message}`);
	}
};
const assistantChatUpdate = async (workspaceId, folderId, chatId, messageData) => {
	try {
		const workspace = await Workspace.findOne({
			_id: workspaceId,
			"folders._id": folderId,
		});
		if (!workspace) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Workspace or Folder not found!");
		}

		const folder = workspace.folders.id(folderId);

		if (chatId === "newChat") {
			const chat = {
				chatTitle: "New Chat",
				media: messageData.media || [],
				documents: messageData.documents || [],
				generalMessages: [
					{
						text: messageData.text,
						sender: messageData.sender,
						from: "user",
						pdfPath: messageData.pdfPath,
					},
				],
			};

			const result = await Workspace.findOneAndUpdate(
				{ _id: workspaceId, "folders._id": folderId },
				{ $push: { "folders.$.chats": chat } },
				{ new: true },
			);

			const updatedChatFolder = result.folders.id(folderId);

			if (!updatedChatFolder) {
				throw new ApiError(httpStatus.BAD_REQUEST, "Folder not found!");
			}

			const chats = updatedChatFolder.chats;
			const newChat = chats[chats.length - 1];

			const body = {
				user_id: messageData.sender,
				chat_id: newChat._id,
				message: messageData.text,
				history: "",
			};

			const chatFromAI = await getChatFromAI(body);

			if (Object.keys(chatFromAI).length > 0) {
				if (chatFromAI.message) {
					newChat.generalMessages.push({
						text: chatFromAI.message,
						from: "ai",
					});
				}

				if (chatFromAI.title) {
					newChat.chatTitle = chatFromAI.title;
				}

				await result.save();
			}

			return {
				success: true,
				message: "Chat added or updated successfully",
				chat: newChat,
				text: chatFromAI.message,
			};
		}

		const chat = folder.chats.id(chatId);

		if (!chat) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Chat not found!");
		}

		const newMessage = {
			text: messageData.text,
			sender: messageData.sender,
			from: "user",
			pdfPath: messageData.pdfPath,
		};

		const isMedia = isArrayWithLength(messageData.media);
		const isDocument = isArrayWithLength(messageData.documents);

		if (isMedia) {
			chat.media.push(...messageData.media);
		}

		if (isDocument) {
			chat.documents.push(...messageData.documents);
		}

		chat.generalMessages.push(newMessage);
		// chat.markModified("generalMessages");

		await workspace.save();

		if (isMedia || isDocument) {
			const body = {
				pdf_file: messageData?.media?.at(0) || messageData?.documents?.at(0),
				user_id: messageData.sender,
				chat_id: chat._id,
			};
			try {
				await axios.post(`${config.baseUrl}/upload-files`, body);
			} catch (error) {
				console.error("Failed to send data:", error);
				throw new Error("AI server error");
			}
		}

		const textMessages = chat.generalMessages.filter((msg) => msg.text).map((msg) => msg.text);
		const body = {
			user_id: messageData.sender,
			chat_id: chat._id,
			message: messageData.text,
			history: textMessages,
		};

		try {
			const gptResponse = await axios.post(`${config.baseUrl}/chat`, body);
			const gptMessage = {
				text: gptResponse.data.message,
				from: "ai",
			};

			if (gptResponse.data?.title) {
				chat.chatTitle = gptResponse.data.title;
			}

			chat.generalMessages.push(gptMessage);
			await workspace.save();
			const newChat = chat.generalMessages[chat.generalMessages.length - 1].toObject();

			if (newChat && (isMedia || isDocument)) {
				const pdfPath = messageData?.media?.at(0) || messageData?.documents?.at(0);
				pdfPath.url = `${config.rootPath}${pdfPath.name || pdfPath.url}`;
				newChat.file = pdfPath;
			}

			return newChat;
		} catch (error) {
			console.error("Failed to send data to AI server:", error.message);
			throw new Error("AI server error");
		}
	} catch (error) {
		console.error("Error adding message to chat:", error);
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
	}
};
const getChatMedia = async (workspaceId, folderId, chatId) => {
	try {
		const workspace = await Workspace.findOne({
			_id: workspaceId,
			"folders._id": folderId,
			"folders.chats._id": chatId,
		});

		if (!workspace) {
			throw new ApiError(httpStatus.NOT_FOUND, "Workspace, Folder, or Chat not found!");
		}

		const folder = workspace.folders.id(folderId);
		const chat = folder.chats.id(chatId);

		// const media = chat.generalMessages.flatMap((message) => message.media);
		return chat.media;
	} catch (error) {
		console.log("error getting chat media", error);
		throw new ApiError(httpStatus.NOT_FOUND, `error getting chat media: ${error.message}`);
	}
};
const getChatLinks = async (workspaceId, folderId, chatId) => {
	try {
		const workspace = await Workspace.findOne({
			_id: workspaceId,
			"folders._id": folderId,
			"folders.chats._id": chatId,
		});

		if (!workspace) {
			throw new ApiError(httpStatus.NOT_FOUND, "Workspace, Folder, or Chat not found!");
		}

		const folder = workspace.folders.id(folderId);
		const chat = folder.chats.id(chatId);

		// const links = chat.generalMessages.flatMap((message) => message.links);
		return chat.links;
	} catch (error) {
		console.log("error getting chat links", error);
		throw new ApiError(httpStatus.NOT_FOUND, `error getting chat links: ${error.message}`);
	}
};
const getChatDocuments = async (workspaceId, folderId, chatId) => {
	try {
		const workspace = await Workspace.findOne({
			_id: workspaceId,
			"folders._id": folderId,
			"folders.chats._id": chatId,
		});

		if (!workspace) {
			throw new ApiError(httpStatus.NOT_FOUND, "Workspace, Folder, or Chat not found!");
		}

		const folder = workspace.folders.id(folderId);
		const chat = folder.chats.id(chatId);

		// const documents = chat.flatMap((message) => message.documents);
		return chat.documents;
	} catch (error) {
		console.log("error getting chat documents", error);
		throw new ApiError(httpStatus.NOT_FOUND, `error getting chat documents: ${error.message}`);
	}
};
const createComment = async (
	workspaceId,
	folderId,
	contextId, // chatId or assessmentId or wireframeId
	messageId, // Unique ID for either a message or a question/answer
	commentData,
	contextType, // 'chat' or 'assessment' or 'wireframe'
) => {
	try {
		const workspace = await Workspace.findOne({
			_id: workspaceId,
			"folders._id": folderId,
		});

		if (!workspace) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Workspace or Folder not found!");
		}

		if (contextType === "chat") {
			const folder = workspace.folders.id(folderId);
			const chat = folder.chats.id(contextId);

			if (!chat) {
				throw new ApiError(httpStatus.BAD_REQUEST, "Chat not found!");
			}

			chat.comments.push(commentData);
			await workspace.save();

			const message = chat.generalMessages.find((message) => message._id.toString() === messageId);

			const newChat = chat.comments[chat.comments.length - 1].toObject();
			newChat.message = message.text;
			return newChat;
		} else if (contextType === "assessment") {
			const folder = workspace.folders.id(folderId);
			const assessment = folder.assessments.id(contextId);

			if (!assessment) {
				throw new ApiError(httpStatus.BAD_REQUEST, "Assessment not found!");
			}

			let questionAnswerFound = null;

			for (const report of assessment.report) {
				for (const subReport of report.subReport) {
					questionAnswerFound = subReport.questionAnswer.find((qa) => qa._id.toString() === messageId);
					if (questionAnswerFound) break;
				}
				if (questionAnswerFound) break;
			}

			if (!questionAnswerFound) {
				throw new ApiError(httpStatus.BAD_REQUEST, "Message not found!");
			}

			questionAnswerFound.comments.push(commentData);
			await workspace.save();

			return questionAnswerFound.comments[questionAnswerFound.comments.length - 1];
		} else if (contextType === "wireframe") {
			const folder = workspace.folders.id(folderId);
			const wireframe = folder.wireframes.id(contextId);

			if (!wireframe) {
				throw new ApiError(httpStatus.BAD_REQUEST, "Wireframe not found!");
			}

			wireframe.comments.push(commentData);
			await workspace.save();

			return wireframe.comments[wireframe.comments.length - 1];
		} else {
			throw new ApiError(httpStatus.BAD_REQUEST, "Invalid context type!");
		}
	} catch (error) {
		console.error("Error creating comment:", error);
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
	}
};
const getUserChatComments = async (userId) => {
	try {
		const workspaces = await Workspace.find({
			"folders.chats.comments.userId": userId,
		});

		const comments = [];

		workspaces.forEach((workspace) => {
			workspace.folders.forEach((folder) => {
				folder.chats.forEach((chat) => {
					chat.generalMessages.forEach((message) => {
						chat.comments.forEach((comment) => {
							if (
								comment.userId.toString() === userId.toString() &&
								comment.messageId.toString() === message._id.toString()
							) {
								comments.push({
									workspaceId: workspace._id,
									folderId: folder._id,
									chatId: chat._id,
									messageId: message._id,
									comment,
								});
							}
						});
					});
				});
			});
		});
		return comments;
	} catch (error) {
		console.error("Error retrieving comments:", error);
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
	}
};
const updateComment = async (workspaceId, folderId, contextId, messageId, commentId, commentData, contextType) => {
	try {
		const workspace = await Workspace.findOne({
			_id: workspaceId,
			"folders._id": folderId,
		});
		if (!workspace) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Workspace or Folder not found!");
		}

		const folder = workspace.folders.id(folderId);

		let comment;

		if (contextType === "chat") {
			const chat = folder.chats.id(contextId);
			// const message = chat.generalMessages.id(messageId);
			if (!chat) {
				throw new ApiError(httpStatus.BAD_REQUEST, "Message not found!");
			}
			comment = chat.comments.id(commentId);
		} else if (contextType === "assessment") {
			const assessment = folder.assessments.id(contextId);
			let foundComment = false;

			// Iterate through subReports to find the correct questionAnswer by ID
			for (const report of assessment.report) {
				for (const subReport of report.subReport) {
					const qa = subReport.questionAnswer.id(messageId);
					if (qa) {
						comment = qa.comments.id(commentId);
						foundComment = true;
						break;
					}
				}
				if (foundComment) break;
			}

			if (!foundComment) {
				throw new ApiError(httpStatus.BAD_REQUEST, "Question/Answer not found!");
			}
		}

		if (!comment) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Comment not found!");
		}

		Object.assign(comment, commentData);
		await workspace.save();

		return comment;
	} catch (error) {
		console.error("Error updating comment:", error);
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
	}
};
const deleteComment = async (workspaceId, folderId, chatId, messageId, commentId) => {
	try {
		const updatedWorkspace = await Workspace.findOneAndUpdate(
			{
				_id: workspaceId,
			},
			{
				$pull: {
					"folders.$[folder].chats.$[chat].comments": { _id: commentId },
				},
			},
			{
				arrayFilters: [{ "folder._id": folderId }, { "chat._id": chatId }],
				new: true,
			},
		);

		if (!updatedWorkspace) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Workspace, Folder, or Chat not found!");
		}

		return { success: true, message: "Comment deleted successfully" };
	} catch (error) {
		throw new ApiError(httpStatus.BAD_REQUEST, `Error deleting comment: ${error.message}`);
	}
};
const bookmarkMessage = async (workspaceId, folderId, contextId, messageId, userId, contextType) => {
	try {
		const workspace = await Workspace.findOne({
			_id: workspaceId,
			"folders._id": folderId,
		});
		if (!workspace) throw new ApiError(httpStatus.BAD_REQUEST, "Workspace or Folder not found!");

		const folder = workspace.folders.id(folderId);

		let message;
		if (contextType === "chat") {
			const chat = folder.chats.id(contextId);
			if (!chat) throw new ApiError(httpStatus.BAD_REQUEST, "Chat not found!");
			message = chat;
		} else if (contextType === "assessment") {
			const assessment = folder.assessments.id(contextId);
			if (!assessment) throw new ApiError(httpStatus.BAD_REQUEST, "Assessment not found!");

			for (const report of assessment.report) {
				for (const subReport of report.subReport) {
					const questionAnswer = subReport.questionAnswer.id(messageId);
					if (questionAnswer) {
						message = questionAnswer;
						break;
					}
				}
				if (message) break;
			}
		}

		if (!message) throw new ApiError(httpStatus.BAD_REQUEST, "Message or Question-Answer not found!");

		message.bookmarks.push({ userId, messageId, timestamp: new Date() });
		await workspace.save();

		return message.bookmarks[message.bookmarks.length - 1];
	} catch (error) {
		console.error("Error bookmarking message:", error);
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
	}
};
const unbookmarkMessage = async (workspaceId, folderId, contextId, messageId, bookmarkId, contextType) => {
	try {
		const workspace = await Workspace.findOne({
			_id: workspaceId,
			"folders._id": folderId,
		});
		if (!workspace) throw new ApiError(httpStatus.BAD_REQUEST, "Workspace or Folder not found!");

		const folder = workspace.folders.id(folderId);

		let message;
		if (contextType === "chat") {
			const chat = folder.chats.id(contextId);
			if (!chat) throw new ApiError(httpStatus.BAD_REQUEST, "Chat not found!");
			message = chat;
		} else if (contextType === "assessment") {
			const assessment = folder.assessments.id(contextId);
			if (!assessment) throw new ApiError(httpStatus.BAD_REQUEST, "Assessment not found!");

			for (const report of assessment.report) {
				for (const subReport of report.subReport) {
					const questionAnswer = subReport.questionAnswer.id(messageId);
					if (questionAnswer) {
						message = questionAnswer;
						break;
					}
				}
				if (message) break;
			}
		}

		if (!message) throw new ApiError(httpStatus.BAD_REQUEST, "Message or Question-Answer not found!");

		const bookmark = message.bookmarks.id(bookmarkId);
		if (!bookmark) throw new ApiError(httpStatus.BAD_REQUEST, "Bookmark not found!");

		bookmark.remove();
		await workspace.save();

		return bookmark;
	} catch (error) {
		console.error("Error unbookmarking message:", error);
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
	}
};
const getBookmarksForUser = async (userId) => {
	try {
		const workspaces = await Workspace.find({
			"folders.chats.bookmarks.userId": userId,
		});

		const bookmarks = [];

		workspaces.forEach((workspace) => {
			workspace.folders.forEach((folder) => {
				folder.chats.forEach((chat) => {
					chat.generalMessages.forEach((message) => {
						chat.bookmarks.forEach((bookmark) => {
							if (
								bookmark.userId.toString() === userId.toString() &&
								bookmark.messageId.toString() === message._id.toString()
							) {
								bookmarks.push({
									workspaceId: workspace._id,
									folderId: folder._id,
									chatId: chat._id,
									messageId: message._id,
									bookmark,
								});
							}
						});
					});
				});
			});
		});

		return bookmarks;
	} catch (error) {
		console.error("Error retrieving bookmarks:", error);
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
	}
};
const getBookmarksForChat = async (userId, workspaceId, folderId, chatId) => {
	try {
		const workspace = await Workspace.findOne({
			_id: workspaceId,
			"folders._id": folderId,
			"folders.chats._id": chatId,
			"folders.chats.bookmarks.userId": userId,
		});

		if (!workspace) throw new ApiError(httpStatus.BAD_REQUEST, "Workspace, Folder, or Chat not found!");

		const folder = workspace.folders.id(folderId);
		const chat = folder.chats.id(chatId);
		const bookmarks = [];

		chat.generalMessages.forEach((message) => {
			chat.bookmarks.forEach((bookmark) => {
				if (bookmark.userId.toString() === userId.toString() && bookmark.messageId.toString() === message._id.toString()) {
					bookmarks.push({
						workspaceId: workspace._id,
						folderId: folder._id,
						chatId: chat._id,
						messageId: message._id,
						bookmark,
					});
				}
			});
		});

		return bookmarks;
	} catch (error) {
		console.error("Error retrieving bookmarks for chat:", error);
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
	}
};
const addReplyToComment = async (workspaceId, folderId, chatId, messageId, commentId, replyData) => {
	try {
		const workspace = await Workspace.findOne({
			_id: workspaceId,
			"folders._id": folderId,
		});

		if (!workspace) throw new ApiError(httpStatus.BAD_REQUEST, "Workspace or Folder not found!");

		const folder = workspace.folders.id(folderId);
		const chat = folder.chats.id(chatId);
		const comment = chat.comments.id(commentId);

		if (!comment) throw new ApiError(httpStatus.BAD_REQUEST, "Comment not found!");

		comment.replies.push(replyData);

		await workspace.save();
		return comment.replies[comment.replies.length - 1];
	} catch (error) {
		console.error("Error adding reply to comment:", error);
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
	}
};
const updateReplyInComment = async (workspaceId, folderId, chatId, messageId, commentId, replyId, replyData) => {
	try {
		const workspace = await Workspace.findOne({
			_id: workspaceId,
			"folders._id": folderId,
		});

		if (!workspace) throw new ApiError(httpStatus.BAD_REQUEST, "Workspace or Folder not found!");

		const folder = workspace.folders.id(folderId);
		const chat = folder.chats.id(chatId);
		const comment = chat.comments.id(commentId);
		const reply = comment.replies.id(replyId);

		if (!reply) throw new ApiError(httpStatus.BAD_REQUEST, "Reply not found!");

		Object.assign(reply, replyData);

		await workspace.save();
		return reply;
	} catch (error) {
		console.error("Error updating reply in comment:", error);
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
	}
};
const createAssessment = async (workspaceId, folderId, body) => {
	try {
		const workspace = await Workspace.findOne(
			{
				_id: workspaceId,
				"folders._id": folderId,
			},
			{
				userId: 1,
				"folders.$": 1,
			},
		);

		if (!workspace) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Workspace or Folder not found!");
		}

		const { userId } = workspace;

		const apiBody = {
			user_id: userId,
			chat_id: folderId,
			message: body.message || "",
			general_info: body.generalInfo || "",
			bussiness_info: body.bussiness_info || "",
			assessment_name: body.assessmentName,
		};
		const gptURL = `${config.baseUrl}/assesment-chat`;
		const gptResponse = await makeAxiosCall({ url: gptURL, method: "POST", data: apiBody });
		const nextQuestion = gptResponse.message;

		const subReport = {
			ReportTitle: body.assessmentName,
			questionAnswer: [],
		};

		subReport.questionAnswer.push({
			question: {
				content: nextQuestion,
				timestamp: new Date(),
			},
			answer: {
				userId: null,
				content: "", // Answer is pending from the user
				timestamp: null,
			},
		});
		const newAssessment = {
			name: body.name,
			version: 1,
			report: [
				{
					ReportTitle: "Initial Assessment Report",
					subReport: [subReport],
				},
			],
			media: body.media || [],
			documents: body.documents || [],
		};

		const updatedWorkspace = await Workspace.findOneAndUpdate(
			{ _id: workspaceId, "folders._id": folderId },
			{ $push: { "folders.$.assessments": newAssessment } },
			{ new: true, returnOriginal: false },
		);
		const workspaceFolder = updatedWorkspace.folders.find((folder) => folder._id.toString() === folderId);
		const createdAssessment = workspaceFolder.assessments.at(-1).toObject();

		createdAssessment.text = nextQuestion;
		return createdAssessment;
	} catch (error) {
		throw new ApiError(httpStatus.BAD_REQUEST, `Error creating assessment: ${error.message}`);
	}
};
const updateAssessment = async (workspaceId, folderId, assessmentId, subReportId, updateBody) => {
	try {
		// Find the workspace, folder, and assessment
		const workspace = await Workspace.findOne({
			_id: workspaceId,
			"folders._id": folderId,
			"folders.assessments._id": assessmentId,
			"folders.assessments.report.subReport._id": subReportId,
		});

		if (!workspace) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Workspace, Folder, or Assessment not found!");
		}

		const previousAnswer = {
			userId: workspace.userId, // Ensure this is the correct user
			content: updateBody.content,
			timestamp: new Date(),
		};

		const updatedWorkspace = await Workspace.findOneAndUpdate(
			{
				_id: workspaceId,
				"folders._id": folderId,
				"folders.assessments._id": assessmentId,
				"folders.assessments.report.subReport._id": subReportId,
			},
			{
				$set: {
					"folders.$.assessments.$[assessment].report.$[].subReport.$[subReport].questionAnswer.$[lastIndex].answer":
						previousAnswer,
				},
			},
			{
				arrayFilters: [
					{ "assessment._id": assessmentId },
					{ "subReport._id": subReportId },
					{ "lastIndex._id": { $exists: true } },
				],
				new: true,
			},
		);

		// Find the relevant assessment
		const assessment = updatedWorkspace.folders
			.find((folder) => folder._id.toString() === folderId)
			.assessments.find((assessment) => assessment._id.toString() === assessmentId);

		if (!assessment) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Assessment not found!");
		}

		// Retrieve the pending question from the subReport
		const subReport = assessment.report[0].subReport.find((sub) => sub._id.toString() === subReportId);

		if (!subReport) {
			throw new ApiError(httpStatus.BAD_REQUEST, "No pending question found!");
		}

		// Create a new question-answer entry with the user's response
		// const newQuestionAnswer = {
		// 	question: {
		// 		content: subReport.pendingQuestion,
		// 		timestamp: new Date(),
		// 	},
		// 	answer: {
		// 		userId: assessment.userId, // Ensure this is the correct user
		// 		content: updateBody.content,
		// 		timestamp: new Date(),
		// 	},
		// };

		// Add the new question/answer to the subReport and remove the pending question
		// subReport.questionAnswer.push(newQuestionAnswer);
		// delete subReport.pendingQuestion; // Clear the pending question

		// Prepare the history for the API call
		const textMessages = ["", ...subReport.questionAnswer.flatMap((qa) => [qa.question.content, qa.answer.content])];

		// Make the API call with the updated history
		const apiBody = {
			user_id: updatedWorkspace.userId,
			chat_id: assessment._id.toString(),
			message: updateBody.content,
			history: textMessages,
			general_info: assessment.generalInfo,
			business_info: assessment.businessInfo,
			assessment_name: subReport.ReportTitle,
		};

		const gptURL = `${config.baseUrl}/assesment-chat`;
		const gptResponse = await makeAxiosCall({ url: gptURL, method: "POST", data: apiBody });

		if (!gptResponse) {
			throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, "Error making API call to GPT!");
		}

		// Check if the response contains markdown
		const containsMarkdown = gptResponse.message.includes("```");
		const nextQuestion = gptResponse.message;
		const nextQuestionData = {
			question: {
				content: nextQuestion,
				timestamp: new Date(),
			},
			answer: {
				userId: null,
				content: "", // Answer is pending from the user
				timestamp: null,
			},
		};

		if (containsMarkdown) {
			// Convert markdown to PDF
			const pdfFileName = `${Date.now()}_assessment_report.pdf`;
			const pdfFilePath = path.resolve(process.cwd(), "public/uploads", pdfFileName);

			convertMarkdownToPdf(gptResponse.message, pdfFilePath);

			// Move the current finalReport to subReport
			const previousReport = {
				finalSubReport: assessment.report[0].finalReport,
				finalSubReportURL: assessment.report[0].finalReportURL,
				ReportTitle: "Previous Assessment Report",
				questionAnswer: subReport.questionAnswer,
			};

			// Update the subReport with the previous finalReport
			assessment.report[0].subReport.push(previousReport);

			// Update the current finalReport
			assessment.report[0].finalReport = gptResponse.message;
			assessment.report[0].finalReportURL = `/uploads/${pdfFileName}`;
		} else {
			// The response does not contain markdown
			// Store the next question as the pending question
			subReport.questionAnswer.push(nextQuestionData);
		}

		if (updateBody.media) {
			assessment.media.push(...updateBody.media);
		}
		if (updateBody.documents) {
			assessment.documents.push(...updateBody.documents);
		}
		// Update the assessment in the database
		await Workspace.findOneAndUpdate(
			{
				_id: workspaceId,
				"folders._id": folderId,
				"folders.assessments._id": assessmentId,
			},
			{
				$set: {
					"folders.$.assessments.$[assessment].report": assessment.report,
				},
			},
			{
				arrayFilters: [{ "assessment._id": assessmentId }],
				new: true,
			},
		);

		return { success: true, question: nextQuestionData.question, text: nextQuestion };
	} catch (error) {
		throw new ApiError(httpStatus.BAD_REQUEST, `Error storing user response: ${error.message}`);
	}
};
const getAssessment = async (workspaceId, folderId, assessmentId) => {
	try {
		const workspace = await Workspace.findOne({
			_id: workspaceId,
			"folders._id": folderId,
			"folders.assessments._id": assessmentId,
		});

		if (!workspace) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Workspace, Folder, or Assessment not found!");
		}

		const folder = workspace.folders.find((folder) => folder._id.toString() === folderId);
		if (!folder) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Folder not found!");
		}

		const assessment = folder.assessments.find((assessment) => assessment._id.toString() === assessmentId);
		if (!assessment) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Assessment not found!");
		}

		if (assessment.isSoftDeleted) {
			throw new ApiError(httpStatus.NOT_FOUND, "Assessment is soft-deleted and not available.");
		}

		return assessment;
	} catch (error) {
		throw new ApiError(httpStatus.BAD_REQUEST, `Error retrieving assessment: ${error.message}`);
	}
};
const deleteAssessment = async (workspaceId, folderId, assessmentId) => {
	try {
		const workspace = await Workspace.findOne({
			_id: workspaceId,
			"folders._id": folderId,
			"folders.assessments._id": assessmentId,
		});

		if (!workspace) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Workspace, Folder, or Assessment not found!");
		}

		const folder = workspace.folders.id(folderId);
		if (!folder) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Folder not found!");
		}

		const assessment = folder.assessments.id(assessmentId);
		if (!assessment) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Assessment not found!");
		}

		if (assessment.isSoftDeleted) {
			await Workspace.findOneAndUpdate(
				{
					_id: workspaceId,
					"folders._id": folderId,
				},
				{
					$pull: {
						"folders.$.assessments": { _id: assessmentId },
					},
				},
				{ new: true },
			);
			return { success: true, message: "Assessment permanently deleted" };
		} else {
			assessment.isSoftDeleted = true;
			await workspace.save();
			return { success: true, message: "Assessment soft deleted" };
		}
	} catch (error) {
		throw new ApiError(httpStatus.BAD_REQUEST, `Error deleting assessment: ${error.message}`);
	}
};
const createBusinessInfo = async (workspaceId, folderId, body) => {
	try {
		const workspace = await Workspace.findOne({
			_id: workspaceId,
			"folders._id": folderId,
		});

		if (!workspace) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Workspace or Folder not found!");
		}

		const folder = workspace.folders.id(folderId);

		if (!folder) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Folder not found!");
		}

		folder.businessInfo.push(body);
		await workspace.save();

		return {
			success: true,
			message: "Business information created successfully",
			data: folder.businessInfo[folder.businessInfo.length - 1],
		};
	} catch (error) {
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Error creating business information: ${error.message}`);
	}
};
const getBusinessInfo = async (workspaceId, folderId, businessInfoId) => {
	try {
		const workspace = await Workspace.findOne({
			_id: workspaceId,
			"folders._id": folderId,
			"folders.businessInfo._id": businessInfoId,
		});

		if (!workspace) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Workspace, Folder, or Business Info not found!");
		}

		const businessInfo = workspace.folders
			.find((folder) => folder._id.toString() === folderId)
			.businessInfo.find((info) => info._id.toString() === businessInfoId);

		if (!businessInfo) {
			throw new ApiError(httpStatus.NOT_FOUND, "Business information not found!");
		}

		return businessInfo;
	} catch (error) {
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Error retrieving business information: ${error.message}`);
	}
};
const updateBusinessInfo = async (workspaceId, folderId, businessInfoId, body) => {
	try {
		const workspace = await Workspace.findOne({
			_id: workspaceId,
			"folders._id": folderId,
			"folders.businessInfo._id": businessInfoId,
		});

		if (!workspace) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Workspace, Folder, or Business Information not found!");
		}

		const folderIndex = workspace.folders.findIndex((folder) => folder._id.toString() === folderId);

		if (folderIndex === -1) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Folder not found!");
		}

		const businessInfoIndex = workspace.folders[folderIndex].businessInfo.findIndex(
			(info) => info._id.toString() === businessInfoId,
		);

		if (businessInfoIndex === -1) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Business information not found!");
		}

		workspace.folders[folderIndex].businessInfo[businessInfoIndex] = body;

		await workspace.save();

		return {
			success: true,
			message: "Business information updated successfully",
			data: workspace.folders[folderIndex].businessInfo[businessInfoIndex],
		};
	} catch (error) {
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Error updating business information: ${error.message}`);
	}
};
const deleteBusinessInfo = async (workspaceId, folderId, businessInfoId) => {
	try {
		const workspace = await Workspace.findOneAndUpdate(
			{
				_id: workspaceId,
				"folders._id": folderId,
				"folders.businessInfo._id": businessInfoId,
			},
			{
				$pull: {
					"folders.$.businessInfo": { _id: businessInfoId },
				},
			},
			{ new: true },
		);

		if (!workspace) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Workspace, Folder, or Business Information not found!");
		}

		return { success: true, message: "Business information deleted successfully" };
	} catch (error) {
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Error deleting business information: ${error.message}`);
	}
};
const createSurveyInfo = async (workspaceId, folderId, surveyInfoArray) => {
	try {
		const workspace = await Workspace.findOne({
			_id: workspaceId,
			"folders._id": folderId,
		});

		if (!workspace) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Workspace or Folder not found!");
		}

		const folder = workspace.folders.id(folderId);

		if (!folder) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Folder not found!");
		}

		folder.surveyInfo.push(...surveyInfoArray);

		await workspace.save();

		return {
			success: true,
			message: "Survey information created successfully",
			data: folder.surveyInfo.slice(-surveyInfoArray.length),
		};
	} catch (error) {
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Error creating survey information: ${error.message}`);
	}
};
const getSurveyInfo = async (workspaceId, folderId) => {
	try {
		const workspace = await Workspace.findOne({
			_id: workspaceId,
			"folders._id": folderId,
		});

		if (!workspace) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Workspace or Folder not found!");
		}

		const folder = workspace.folders.find((folder) => folder._id.toString() === folderId);

		if (!folder) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Folder not found!");
		}

		const surveyInfoArray = folder.surveyInfo;

		if (!surveyInfoArray || surveyInfoArray.length === 0) {
			throw new ApiError(httpStatus.NOT_FOUND, "Survey information not found!");
		}

		return surveyInfoArray;
	} catch (error) {
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Error retrieving survey information: ${error.message}`);
	}
};
const updateSurveyInfo = async (workspaceId, folderId, body) => {
	try {
		const workspace = await Workspace.findOne({
			_id: workspaceId,
			"folders._id": folderId,
		});

		if (!workspace) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Workspace or Folder not found!");
		}

		const folderIndex = workspace.folders.findIndex((folder) => folder._id.toString() === folderId);

		if (folderIndex === -1) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Folder not found!");
		}

		workspace.folders[folderIndex].surveyInfo = body;

		await workspace.save();

		return {
			success: true,
			message: "Survey information updated successfully",
			data: workspace.folders[folderIndex].surveyInfo,
		};
	} catch (error) {
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Error updating survey information: ${error.message}`);
	}
};
const deleteSurveyInfo = async (workspaceId, folderId) => {
	try {
		const workspace = await Workspace.findOneAndUpdate(
			{
				_id: workspaceId,
				"folders._id": folderId,
			},
			{
				$set: {
					"folders.$.surveyInfo": [],
				},
			},
			{ new: true },
		);

		if (!workspace) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Workspace or Folder not found!");
		}

		return { success: true, message: "Survey information deleted successfully" };
	} catch (error) {
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Error deleting survey information: ${error.message}`);
	}
};
const updateAssistantChat = async (workspaceId, folderId, chatId, body) => {
	try {
		const workspace = await Workspace.findOne({
			_id: workspaceId,
			"folders._id": folderId,
			"folders.chats._id": chatId,
		});

		if (!workspace) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Workspace, Folder, or Chat not found!");
		}

		const folder = workspace.folders.id(folderId);
		if (!folder) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Folder not found!");
		}

		const chat = folder.chats.id(chatId);
		if (!chat) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Chat not found!");
		}

		Object.keys(body).forEach((key) => {
			chat[key] = body[key];
		});
		await workspace.save();

		return {
			success: true,
			message: "Assistant chat updated successfully",
			data: chat,
		};
	} catch (error) {
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Error updating assistant chat: ${error.message}`);
	}
};
const moveEntityToTrash = async (entityType, id) => {
	const handlers = {
		workspace: async () => {
			const workspace = await Workspace.findById(id);
			if (!workspace) throw new ApiError(httpStatus.NOT_FOUND, "Workspace not found");
			if (workspace.workspaceName === "Default Workspace") {
				throw new ApiError(httpStatus.BAD_REQUEST, "Default workspace cannot be moved to trash!");
			}
			workspace.isSoftDeleted = true;
			return await workspace.save();
		},

		folder: async () => {
			const workspace = await Workspace.findOne({ "folders._id": id });
			if (!workspace) throw new ApiError(httpStatus.NOT_FOUND, "Workspace not found");
			const folder = workspace.folders.id(id);
			if (!folder) throw new ApiError(httpStatus.NOT_FOUND, "Folder not found");
			if (folder.folderName === "Default Folder") {
				throw new ApiError(httpStatus.BAD_REQUEST, "Default folder cannot be moved to trash!");
			}
			folder.isSoftDeleted = true;
			return await workspace.save();
		},

		chat: async () => {
			return Workspace.findOneAndUpdate(
				{ "folders.chats._id": id },
				{ $set: { "folders.$[].chats.$[chat].isSoftDeleted": true } },
				{ arrayFilters: [{ "chat._id": id }], new: true },
			);
		},

		assessment: async () => {
			return Workspace.findOneAndUpdate(
				{ "folders.assessments._id": id },
				{ $set: { "folders.$[].assessments.$[assessment].isSoftDeleted": true } },
				{ arrayFilters: [{ "assessment._id": id }], new: true },
			);
		},
	};

	const handler = handlers[entityType];
	if (!handler) throw new ApiError(httpStatus.BAD_REQUEST, "Invalid entity type");
	return await handler();
};
const restoreEntityFromTrash = async (entityType, id) => {
	switch (entityType) {
		case "workspace":
			return Workspace.findByIdAndUpdate(id, { isSoftDeleted: false }, { new: true });

		case "folder":
			return Workspace.findOneAndUpdate(
				{ "folders._id": id },
				{ $set: { "folders.$.isSoftDeleted": false } },
				{ new: true },
			);

		case "chat":
			return Workspace.findOneAndUpdate(
				{ "folders.chats._id": id },
				{ $set: { "folders.$[].chats.$[chat].isSoftDeleted": false } },
				{ arrayFilters: [{ "chat._id": id }], new: true },
			);

		case "assessment":
			return Workspace.findOneAndUpdate(
				{ "folders.assessments._id": id },
				{ $set: { "folders.$[].assessments.$[assessment].isSoftDeleted": false } },
				{ arrayFilters: [{ "assessment._id": id }], new: true },
			);

		default:
			return null;
	}
};
const deleteEntityFromTrash = async (entityType, id) => {
	const handlers = {
		workspace: async () => {
			const workspace = await Workspace.findById(id);
			if (!workspace) throw new ApiError(httpStatus.NOT_FOUND, "Workspace not found");
			if (workspace.workspaceName === "Default Workspace") {
				throw new ApiError(httpStatus.BAD_REQUEST, "Default workspace cannot be deleted!");
			}
			return Workspace.findByIdAndDelete(id);
		},

		folder: async () => {
			const workspace = await Workspace.findOne({ "folders._id": id });
			if (!workspace) throw new ApiError(httpStatus.NOT_FOUND, "Workspace not found");
			const folder = workspace.folders.id(id);
			if (!folder) throw new ApiError(httpStatus.NOT_FOUND, "Folder not found");
			if (folder.folderName === "Default Folder") {
				throw new ApiError(httpStatus.BAD_REQUEST, "Default folder cannot be deleted!");
			}
			return Workspace.findOneAndUpdate({ "folders._id": id }, { $pull: { folders: { _id: id } } }, { new: true });
		},

		chat: async () => {
			return Workspace.findOneAndUpdate(
				{ "folders.chats._id": id },
				{ $pull: { "folders.$[].chats": { _id: id } } },
				{ new: true },
			);
		},

		assessment: async () => {
			return Workspace.findOneAndUpdate(
				{ "folders.assessments._id": id },
				{ $pull: { "folders.$[].assessments": { _id: id } } },
				{ new: true },
			);
		},
	};

	const handler = handlers[entityType];
	if (!handler) throw new ApiError(httpStatus.BAD_REQUEST, "Invalid entity type");
	return await handler();
};
const getUserTrash = async (userId) => {
	const workspaces = await Workspace.find({ userId });

	let trashedWorkspaces = [];
	let trashedFolders = [];
	let trashedChats = [];
	let trashedAssessments = [];

	workspaces.forEach((workspace) => {
		if (workspace.isSoftDeleted) {
			trashedWorkspaces.push({
				workspaceName: workspace.workspaceName,
				workspaceDescription: workspace.workspaceDescription,
				_id: workspace._id,
			});
		}

		workspace.folders.forEach((folder) => {
			if (folder.isSoftDeleted) {
				trashedFolders.push({
					folderName: folder.folderName,
					_id: folder._id,
				});
			}

			folder.chats.forEach((chat) => {
				if (chat.isSoftDeleted) {
					trashedChats.push({
						chatTitle: chat.chatTitle,
						_id: chat._id,
					});
				}
			});

			folder.assessments.forEach((assessment) => {
				if (assessment.isSoftDeleted) {
					trashedAssessments.push({
						assessmentTitle: assessment.name || `Assessment`,
						_id: assessment._id,
					});
				}
			});
		});
	});

	return {
		workspaces: trashedWorkspaces,
		folders: trashedFolders,
		chats: trashedChats,
		assessments: trashedAssessments,
	};
};
const getChatFromAI = async (data) => {
	const gptURL = `${config.baseUrl}/chat`;
	const gptResponse = await makeAxiosCall({ url: gptURL, method: "POST", data: data });
	return gptResponse;
};
const getCommentsForUser = async (userId) => {
	const workspaces = await Workspace.find({
		"folders.chats.comments.userId": userId,
	});

	const comments = [];

	workspaces.forEach((workspace) => {
		workspace.folders.forEach((folder) => {
			folder.chats.forEach((chat) => {
				chat.generalMessages.forEach((message) => {
					chat.comments.forEach((comment) => {
						if (comment.userId.toString() === userId.toString() && comment.messageId.toString() === message._id.toString()) {
							comments.push({
								workspaceId: workspace._id,
								folderId: folder._id,
								chatId: chat._id,
								messageId: message._id,
								comment,
							});
						}
					});
				});
			});
		});
	});

	return comments;
};
const getUserChats = async (userId, query) => {
	const filter = { userId };
	if (query.workspaceId) filter._id = query.workspaceId;
	if (query.folderId) filter["folders._id"] = query.folderId;

	const workspaces = await Workspace.find(filter).lean();
	if (!workspaces || workspaces.length === 0) {
		throw new ApiError(httpStatus.NOT_FOUND, "No workspaces found for this user");
	}

	const chats = workspaces
		.flatMap((workspace) =>
			workspace.folders
				.filter((folder) => !query.folderId || folder._id.toString() === query.folderId)
				.flatMap((folder) =>
					folder.chats.map((chat) => ({
						workspaceId: workspace._id,
						folderId: folder._id,
						...chat,
					})),
				),
		)
		.sort((a, b) => b._id.toString().localeCompare(a._id.toString()));

	return chats;
};
const getUserSitemaps = async (userId, query) => {
	const filter = { userId };
	if (query.workspaceId) filter._id = query.workspaceId;
	if (query.folderId) filter["folders._id"] = query.folderId;

	const workspaces = await Workspace.find(filter).populate("folders.sitemaps").lean();
	if (!workspaces || workspaces.length === 0) {
		throw new ApiError(httpStatus.NOT_FOUND, "No workspaces found for this user");
	}

	const sitemaps = workspaces.flatMap((workspace) =>
		workspace.folders
			.filter((folder) => !query.folderId || folder._id.toString() === query.folderId)
			.flatMap((folder) =>
				folder.sitemaps.map((sitemap) => ({
					workspaceId: workspace._id,
					folderId: folder._id,
					...sitemap,
				})),
			),
	);

	return sitemaps;
};
const getUserAssessments = async (userId, query) => {
	const filter = { userId };
	if (query.workspaceId) filter._id = query.workspaceId;
	if (query.folderId) filter["folders._id"] = query.folderId;

	const workspaces = await Workspace.find(filter).lean();
	if (!workspaces || workspaces.length === 0) {
		throw new ApiError(httpStatus.NOT_FOUND, "No workspaces found for this user");
	}

	const assessments = workspaces.flatMap((workspace) =>
		workspace.folders
			.filter((folder) => !query.folderId || folder._id.toString() === query.folderId)
			.flatMap((folder) =>
				folder.assessments.map((assessment) => ({
					workspaceId: workspace._id,
					folderId: folder._id,
					...assessment,
				})),
			),
	);

	return assessments;
};
const getUserWireframes = async (userId, query) => {
	const filter = { userId };
	if (query.workspaceId) filter._id = query.workspaceId;
	if (query.folderId) filter["folders._id"] = query.folderId;
	if (query.wireframeId) filter["folders.wireframes._id"] = query.wireframeId;

	const workspaces = await Workspace.find(filter).lean();
	if (!workspaces || workspaces.length === 0) {
		throw new ApiError(httpStatus.NOT_FOUND, "No workspaces found for this user");
	}

	const wireframes = workspaces.flatMap((workspace) =>
		workspace.folders
			.filter((folder) => !query.folderId || folder._id.toString() === query.folderId)
			.flatMap((folder) =>
				folder.wireframes?.map((wireframe) => ({
					workspaceId: workspace._id,
					folderId: folder._id,
					...wireframe,
				})),
			),
	);

	return wireframes;
};
const addSitemapToWorkspace = async (workspaceId, folderId, body) => {
	const { sitemapId } = body;

	const workspace = await Workspace.findById(workspaceId);
	if (!workspace) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Workspace not found!");
	}

	const folder = workspace.folders.id(folderId);
	if (!folder) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Folder not found!");
	}

	folder.sitemaps.push(sitemapId);
	await workspace.save();

	return {
		success: true,
		message: "Sitemap added successfully",
	};
};
const getSitemaps = async (workspaceId, folderId) => {
	const workspace = await Workspace.findById(workspaceId);
	if (!workspace) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Workspace not found!");
	}

	const folder = workspace.folders.id(folderId);
	if (!folder) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Folder not found!");
	}

	const sitemaps = await DigitalPlaybook.find({ _id: { $in: folder.sitemaps } });
	return sitemaps;
};
const getSitemap = async (workspaceId, folderId, sitemapId) => {
	const workspace = await Workspace.findById(workspaceId);
	if (!workspace) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Workspace not found!");
	}

	const folder = workspace.folders.id(folderId);
	if (!folder) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Folder not found!");
	}

	const sitemap = await DigitalPlaybook.findById(sitemapId);
	if (!sitemap) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Sitemap not found!");
	}

	return sitemap;
};
const createWireframe = async (workspaceId, folderId, body) => {
	const { sitemapId, title } = body;

	const workspace = await Workspace.findOne({
		_id: workspaceId,
		"folders._id": folderId,
	});
	if (!workspace) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Workspace or Folder not found!");
	}

	const folder = workspace.folders.id(folderId);
	if (!folder) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Folder not found!");
	}

	const sitemap = await DigitalPlaybook.findById(sitemapId);
	if (!sitemap) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Sitemap not found!");
	}

	const initialBody = {
		user_id: workspace.userId,
		message: sitemap.message,
		wireframe_name: title,
		sitemap_body: sitemap,
	};
	const gptResponse = await axios.post(`${config.baseUrl}/wireframe`, initialBody);
	const response = gptResponse.data;

	const parsedMessage = parseJsonIfPossible(response.message);
	const wireframeNameArray = parsedMessage[title];
	const updatedWireframeLayout = assignPageAndLayoutIndexes(wireframeNameArray, 4, 4);

	const wireframeToUpdate = {
		sitemapId,
		title,
		entities: [],
	};

	for (const wireframeObj of updatedWireframeLayout) {
		wireframeToUpdate.entities.push(wireframeObj);
	}

	folder.wireframes.push(wireframeToUpdate);
	await workspace.save();

	return {
		success: true,
		message: "Wireframe created successfully",
		data: folder.wireframes[folder.wireframes.length - 1],
	};
};
const getWireframes = async (workspaceId, folderId) => {
	const workspace = await Workspace.findById(workspaceId);
	if (!workspace) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Workspace not found!");
	}

	const folder = workspace.folders.id(folderId);
	if (!folder) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Folder not found!");
	}

	return folder.wireframes;
};
const getWireframe = async (workspaceId, folderId, wireframeId) => {
	const workspace = await Workspace.findOne({
		_id: workspaceId,
		"folders._id": folderId,
		"folders.wireframes._id": wireframeId,
	});
	if (!workspace) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Workspace, Folder, or Wireframe not found!");
	}

	const folder = workspace.folders.id(folderId);
	if (!folder) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Folder not found!");
	}

	const wireframe = folder.wireframes.id(wireframeId);
	if (!wireframe) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Wireframe not found!");
	}

	return wireframe;
};
const updateWireframe = async (workspaceId, folderId, wireframeId, body) => {
	const workspace = await Workspace.findOne({
		_id: workspaceId,
		"folders._id": folderId,
		"folders.wireframes._id": wireframeId,
	});

	if (!workspace) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Workspace, Folder, or Wireframe not found!");
	}

	const folder = workspace.folders.id(folderId);
	if (!folder) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Folder not found!");
	}

	const wireframe = folder.wireframes.id(wireframeId);
	if (!wireframe) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Wireframe not found!");
	}

	deepMerge(wireframe, body);
	await workspace.save();

	return {
		success: true,
		message: "Wireframe updated successfully",
		data: wireframe,
	};
};
const deleteWireframe = async (workspaceId, folderId, wireframeId) => {
	const workspace = await Workspace.findOne({
		_id: workspaceId,
		"folders._id": folderId,
		"folders.wireframes._id": wireframeId,
	});

	if (!workspace) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Workspace, Folder, or Wireframe not found!");
	}

	const folder = workspace.folders.id(folderId);
	if (!folder) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Folder not found!");
	}

	const wireframe = folder.wireframes.id(wireframeId);
	if (!wireframe) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Wireframe not found!");
	}

	folder.wireframes.pull(wireframeId);
	await workspace.save();

	return { success: true, message: "Wireframe deleted successfully" };
};
const createWireframeEntity = async (workspaceId, folderId, wireframeId, body) => {
	const workspace = await Workspace.findOne({
		_id: workspaceId,
		"folders._id": folderId,
		"folders.wireframes._id": wireframeId,
	});

	if (!workspace) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Workspace, Folder, or Wireframe not found!");
	}

	const folder = workspace.folders.id(folderId);
	if (!folder) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Folder not found!");
	}

	const wireframe = folder.wireframes.id(wireframeId);
	if (!wireframe) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Wireframe not found!");
	}

	wireframe.entities.push(body);
	await workspace.save();

	return {
		success: true,
		message: "Wireframe entity created successfully",
		data: wireframe.entities[wireframe.entities.length - 1],
	};
};
const bulkCreateWireframeEntity = async (workspaceId, folderId, wireframeId, body) => {
	const workspace = await Workspace.findOne({
		_id: workspaceId,
		"folders._id": folderId,
		"folders.wireframes._id": wireframeId,
	});

	if (!workspace) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Workspace, Folder, or Wireframe not found!");
	}

	const folder = workspace.folders.id(folderId);
	if (!folder) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Folder not found!");
	}

	const wireframe = folder.wireframes.id(wireframeId);
	if (!wireframe) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Wireframe not found!");
	}

	const existingEntityCount = wireframe.entities.length;

	wireframe.entities.push(...body);
	await workspace.save();
	const newlyCreatedEntities = wireframe.entities.slice(existingEntityCount);

	return {
		success: true,
		message: "Wireframe entities created successfully",
		data: newlyCreatedEntities,
	};
};
const bulkUpdateWireframeEntity = async (workspaceId, folderId, wireframeId, body) => {
	const workspace = await Workspace.findOne({
		_id: workspaceId,
		"folders._id": folderId,
		"folders.wireframes._id": wireframeId,
	});

	if (!workspace) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Workspace, Folder, or Wireframe not found!");
	}

	const folder = workspace.folders.id(folderId);
	if (!folder) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Folder not found!");
	}

	const wireframe = folder.wireframes.id(wireframeId);
	if (!wireframe) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Wireframe not found!");
	}

	body.forEach((entity) => {
		const entityToUpdate = wireframe.entities.id(entity.id);
		if (entityToUpdate) {
			deepMerge(entityToUpdate, entity);
		}
	});

	await workspace.save();

	const updatedEntities = wireframe.entities.filter((entity) =>
		body.some((updatedEntity) => updatedEntity.id === entity.id),
	);

	return {
		success: true,
		message: "Wireframe entities updated successfully",
		data: updatedEntities,
	};
};
const bulkDeleteWireframeEntity = async (workspaceId, folderId, wireframeId, entityIds) => {
	const workspace = await Workspace.findOne({
		_id: workspaceId,
		"folders._id": folderId,
		"folders.wireframes._id": wireframeId,
	});

	if (!workspace) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Workspace, Folder, or Wireframe not found!");
	}

	const folder = workspace.folders.id(folderId);
	if (!folder) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Folder not found!");
	}

	const wireframe = folder.wireframes.id(wireframeId);
	if (!wireframe) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Wireframe not found!");
	}

	entityIds.forEach((entityId) => {
		wireframe.entities.pull(entityId);
	});

	await workspace.save();

	return { success: true, message: "Wireframe entities deleted successfully" };
};
const updateWireframeEntity = async (workspaceId, folderId, wireframeId, entityId, body) => {
	const workspace = await Workspace.findOne({
		_id: workspaceId,
		"folders._id": folderId,
		"folders.wireframes._id": wireframeId,
	});

	if (!workspace) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Workspace, Folder, or Wireframe not found!");
	}

	const folder = workspace.folders.id(folderId);
	if (!folder) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Folder not found!");
	}

	const wireframe = folder.wireframes.id(wireframeId);
	if (!wireframe) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Wireframe not found!");
	}

	const entity = wireframe.entities.id(entityId);
	if (!entity) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Entity not found!");
	}

	Object.keys(body).forEach((key) => {
		entity[key] = body[key];
	});

	await workspace.save();

	return {
		success: true,
		message: "Wireframe entity updated successfully",
		data: entity,
	};
};
const deleteWireframeEntity = async (workspaceId, folderId, wireframeId, entityId) => {
	const workspace = await Workspace.findOne({
		_id: workspaceId,
		"folders._id": folderId,
		"folders.wireframes._id": wireframeId,
	});

	if (!workspace) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Workspace, Folder, or Wireframe not found!");
	}

	const folder = workspace.folders.id(folderId);
	if (!folder) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Folder not found!");
	}

	const wireframe = folder.wireframes.id(wireframeId);
	if (!wireframe) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Wireframe not found!");
	}

	const entity = wireframe.entities.id(entityId);
	if (!entity) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Entity not found!");
	}

	wireframe.entities.pull(entityId);
	await workspace.save();

	return { success: true, message: "Wireframe entity deleted successfully" };
};
const uploadEntityImage = async (workspaceId, folderId, wireframeId, entityId, file) => {
	const workspace = await Workspace.findOne({
		_id: workspaceId,
		"folders._id": folderId,
		"folders.wireframes._id": wireframeId,
	});

	if (!workspace) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Workspace, Folder, or Wireframe not found!");
	}

	const folder = workspace.folders.id(folderId);
	if (!folder) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Folder not found!");
	}

	const wireframe = folder.wireframes.id(wireframeId);
	if (!wireframe) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Wireframe not found!");
	}

	const entity = wireframe.entities.id(entityId);
	if (!entity) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Entity not found!");
	}

	entity.image = file.filename;
	await workspace.save();

	return {
		success: true,
		message: "Wireframe entity image uploaded successfully",
		data: entity,
		image: file.filename,
	};
};
const generateAssessmentReport = async (workspaceId, folderId, assessmentId) => {
	const workspace = await Workspace.findOne({
		_id: workspaceId,
		"folders._id": folderId,
		"folders.assessments._id": assessmentId,
	});
	if (!workspace) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Workspace, Folder, or Assessment not found!");
	}

	const folder = workspace.folders.id(folderId);
	if (!folder) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Folder not found!");
	}

	const assessment = folder.assessments.id(assessmentId);
	if (!assessment) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Assessment not found!");
	}

	const assessmentTitle = assessment.report[0].subReport[0].ReportTitle;
	if (!assessmentTitle) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Assessment title not found!");
	}

	const surveyInfoToString = formatQuestionsToString(folder.surveyInfo);

	const reportPayload = {
		user_id: workspace.userId,
		chat_id: assessment._id,
		assessment_name: assessmentTitle,
		general_info: surveyInfoToString,
		business_info: folder.businessInfo,
	};

	const gptURL = `${config.baseUrl}/generate_all_report`;
	const gptResponse = await makeAxiosCall({ url: gptURL, method: "POST", data: reportPayload });

	if (!gptResponse) {
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, "Error generating assessment report");
	}

	const pdfFileName = `${Date.now()}_assessment_report.pdf`;
	const pdfFilePath = path.resolve(process.cwd(), "public/uploads", pdfFileName);

	convertMarkdownToPDF(gptResponse.message, pdfFilePath);

	assessment.report[0].ReportTitle = gptResponse.title;
	assessment.report[0].finalReport = gptResponse.message;
	assessment.report[0].finalReportURL = `/uploads/${pdfFileName}`;

	await workspace.save();

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
	const workspace = await Workspace.findOne({
		_id: workspaceId,
		"folders._id": folderId,
	});
	if (!workspace) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Workspace, Folder, or Assessment not found!");
	}

	const folder = workspace.folders.id(folderId);
	if (!folder) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Folder not found!");
	}

	const assessments = folder.assessments;
	if (!isArrayWithLength(assessments)) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Assessments not found!");
	}

	for (const assessment of assessments) {
		const assessmentTitle = assessment.report[0].subReport[0].ReportTitle;
		if (!assessmentTitle) {
			continue;
		}

		const surveyInfoToString = formatQuestionsToString(folder.surveyInfo);

		const reportPayload = {
			user_id: workspace.userId,
			chat_id: assessment._id,
			assessment_name: assessmentTitle,
			general_info: surveyInfoToString,
			business_info: folder.businessInfo,
		};

		const gptURL = `${config.baseUrl}/generate_all_report`;
		const gptResponse = await makeAxiosCall({ url: gptURL, method: "POST", data: reportPayload });

		if (!gptResponse) {
			break;
		}

		const pdfFileName = `${Date.now()}_assessment_report.pdf`;
		const pdfFilePath = path.resolve(process.cwd(), "public/uploads", pdfFileName);

		convertMarkdownToPDF(gptResponse.message, pdfFilePath);

		assessment.report[0].ReportTitle = gptResponse.title;
		assessment.report[0].finalReport = gptResponse.message;
		assessment.report[0].finalReportURL = `/uploads/${pdfFileName}`;

		await workspace.save();
	}

	return {
		success: true,
		message: "Assessment reports generated successfully",
		data: assessments,
	};
};
const createDefaultWorkspace = async (userId) => {
	const workspace = new Workspace({
		userId,
		workspaceName: "Default Workspace",
		workspaceDescription: "This is your default workspace",
		isActive: true,
		folders: [
			{
				folderName: "Default Folder",
			},
		],
	});

	await workspace.save();
};
const getUserDashboardStats = async (userId) => {
	const workspaces = await Workspace.aggregate([
		{
			$match: { userId, isSoftDeleted: false },
		},
		{
			$project: {
				workspaceName: 1,
				workspaceDescription: 1,
				isActive: 1,
				folders: {
					$filter: {
						input: "$folders",
						as: "folder",
						cond: { $eq: ["$$folder.isSoftDeleted", false] },
					},
				},
			},
		},
	]);

	const activeWorkspace = workspaces.find((workspace) => workspace.isActive);
	const totalWorkspaces = workspaces.length;
	const totalProjects = workspaces.reduce((acc, workspace) => acc + workspace.folders.length, 0);

	const workspaceDetails = workspaces.map((workspace) => ({
		id: workspace._id,
		workspaceName: workspace.workspaceName,
		workspaceDescription: workspace.workspaceDescription,
		isActive: workspace.isActive,
		folders: workspace.folders.map((folder) => ({
			id: folder._id,
			folderName: folder.folderName,
		})),
	}));

	return {
		activeWorkspace: activeWorkspace ? activeWorkspace.workspaceName : "No Active Workspace",
		activeSubscription: "Free",
		totalWorkspaces,
		totalProjects,
		workspaces: workspaceDetails,
	};
};
const getFolderEntities = async (workspaceId, folderId) => {
	const pipeline = [
		{
			$match: {
				_id: ObjectID(workspaceId),
				isSoftDeleted: false,
			},
		},
		{
			$unwind: "$folders",
		},
		{
			$match: {
				"folders._id": ObjectID(folderId),
				"folders.isSoftDeleted": false,
			},
		},
		{
			$project: {
				_id: 0,
				workspaceName: "$workspaceName",
				folderName: "$folders.folderName",
				chats: {
					$slice: [
						{
							$filter: {
								input: "$folders.chats",
								as: "chat",
								cond: {
									$eq: ["$$chat.isSoftDeleted", false],
								},
							},
						},
						5,
					],
				},
				assessments: {
					$slice: [
						{
							$filter: {
								input: "$folders.assessments",
								as: "assessment",
								cond: {
									$eq: ["$$assessment.isSoftDeleted", false],
								},
							},
						},
						5,
					],
				},
				wireframes: {
					$slice: [
						{
							$sortArray: {
								input: "$folders.wireframes",
								sortBy: { createdAt: -1 },
							},
						},
						5,
					],
				},
				sitemaps: {
					$slice: [
						{
							$sortArray: {
								input: "$folders.sitemaps",
								sortBy: { _id: -1 },
							},
						},
						5,
					],
				},
			},
		},
		{
			$lookup: {
				from: "digitalplaybooks",
				localField: "sitemaps",
				foreignField: "_id",
				as: "sitemapDetails",
			},
		},
		{
			$project: {
				workspaceName: 1,
				folderName: 1,
				chats: {
					$map: {
						input: "$chats",
						as: "chat",
						in: {
							id: "$$chat._id",
							chatTitle: "$$chat.chatTitle",
							createdAt: "$$chat.createdAt",
						},
					},
				},
				assessments: {
					$map: {
						input: "$assessments",
						as: "assessment",
						in: {
							id: "$$assessment._id",
							name: {
								$ifNull: ["$$assessment.name", "Assessment"],
							},
							createdAt: "$$assessment.createdAt",
						},
					},
				},
				wireframes: {
					$map: {
						input: "$wireframes",
						as: "wireframe",
						in: {
							id: "$$wireframe._id",
							title: "$$wireframe.title",
							createdAt: "$$wireframe.createdAt",
						},
					},
				},
				sitemaps: {
					$map: {
						input: "$sitemapDetails",
						as: "sitemap",
						in: {
							id: "$$sitemap._id",
							name: "$$sitemap.name",
							createdAt: "$$sitemap.createdAt",
						},
					},
				},
			},
		},
	];

	const folderEntities = await Workspace.aggregate(pipeline);
	return folderEntities;
};
const toggleMessageLike = async (workspaceId, folderId, chatId, messageId, userId) => {
	const workspace = await Workspace.findOne({
		_id: workspaceId,
		"folders._id": folderId,
		"folders.chats._id": chatId,
		"folders.chats.generalMessages._id": messageId,
	});

	if (!workspace) {
		throw new ApiError(httpStatus.NOT_FOUND, "Workspace, Folder, Chat, or Message not found");
	}

	const folder = workspace.folders.id(folderId);
	const chat = folder.chats.id(chatId);
	const message = chat.generalMessages.id(messageId);
	const existingReactionIndex = message.reactions.findIndex((reaction) => reaction.user.toString() === userId.toString());
	if (existingReactionIndex !== -1) {
		const existingReaction = message.reactions[existingReactionIndex];

		if (existingReaction.type === "like") {
			message.reactions.splice(existingReactionIndex, 1);
		} else {
			existingReaction.type = "like";
		}
	} else {
		message.reactions.push({ user: userId, type: "like" });
	}

	await workspace.save();
	return { success: true, message: "Reaction updated", data: message };
};
const toggleMessageDislike = async (workspaceId, folderId, chatId, messageId, userId) => {
	const workspace = await Workspace.findOne({
		_id: workspaceId,
		"folders._id": folderId,
		"folders.chats._id": chatId,
		"folders.chats.generalMessages._id": messageId,
	});

	if (!workspace) {
		throw new ApiError(httpStatus.NOT_FOUND, "Workspace, Folder, Chat, or Message not found");
	}

	const folder = workspace.folders.id(folderId);
	const chat = folder.chats.id(chatId);
	const message = chat.generalMessages.id(messageId);
	const existingReactionIndex = message.reactions.findIndex((reaction) => reaction.user.toString() === userId.toString());
	if (existingReactionIndex !== -1) {
		const existingReaction = message.reactions[existingReactionIndex];

		if (existingReaction.type === "dislike") {
			message.reactions.splice(existingReactionIndex, 1);
		} else {
			existingReaction.type = "dislike";
		}
	} else {
		message.reactions.push({ user: userId, type: "dislike" });
	}

	await workspace.save();
	return { success: true, message: "Reaction updated", data: message };
};

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
	getAssistantChat,
	shareChat,
	acceptChatInvite,
	assistantChatUpdate,
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
};
