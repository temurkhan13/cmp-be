const httpStatus = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const pick = require("../../utils/pick");
const service = require("./service");

const create = catchAsync(async (req, res) => {
	const { user, body } = req;
	const newWorkspaceData = {
		workspaceName: body.workspaceName,
		workspaceDescription: body.workspaceDescription,
		userId: user._id,
		folders: [{ folderName: "Default Folder" }],
	};
	const workSpace = await service.create(newWorkspaceData);
	res.status(httpStatus.CREATED).send(workSpace);
});
const query = catchAsync(async (req, res) => {
	const filter = pick(req.query, ["userId"]);
	const options = pick(req.query, ["page", "limit"]);
	filter.isSoftDeleted = false;
	const workSpace = await service.query(filter, options);
	res.status(httpStatus.OK).send(workSpace);
});
const get = catchAsync(async (req, res) => {
	const { id } = req.params;
	const workSpace = await service.get(id);
	res.status(httpStatus.OK).send(workSpace);
});
const update = catchAsync(async (req, res) => {
	const { id } = req.params;
	const { body } = req;
	const workSpace = await service.update(id, body);
	res.status(httpStatus.OK).send(workSpace);
});
const deleteWorkspace = catchAsync(async (req, res) => {
	const { id } = req.params;
	const workSpace = await service.deleteWorkspace(id);
	res.status(httpStatus.OK).send(workSpace);
});
const createFolder = catchAsync(async (req, res) => {
	const { workspaceId } = req.params;
	const folder = req.body;
	const doc = await service.createFolder(workspaceId, folder);
	console.log("doc", doc);
	res.status(httpStatus.CREATED).send(doc);
});
const updateFolder = catchAsync(async (req, res) => {
	const { workspaceId, folderId } = req.params;
	const { body } = req;
	const doc = await service.updateFolder(workspaceId, folderId, body);
	console.log("doc", doc);
	res.status(httpStatus.CREATED).send(doc);
});
const deleteFolder = catchAsync(async (req, res) => {
	const { workspaceId, folderId } = req.params;
	const doc = await service.deleteFolder(workspaceId, folderId);
	console.log("doc", doc);
	res.status(httpStatus.CREATED).send(doc);
});
const assistantChat = catchAsync(async (req, res) => {
	const { workspaceId, folderId } = req.params;
	const doc = await service.assistantChat(workspaceId, folderId);
	res.status(httpStatus.CREATED).send(doc);
});
const getAssistantChat = catchAsync(async (req, res) => {
	const { workspaceId, folderId, chatId } = req.params;
	const assessment = await service.getAssistantChat(workspaceId, folderId, chatId);
	res.status(httpStatus.CREATED).send(assessment);
});
const shareChat = catchAsync(async (req, res) => {
	const { workspaceId, folderId, chatId } = req.params;
	const { userIdToShare } = req.body;
	console.log("userIdToShare", userIdToShare);

	// const objectId = mongoose.Types.ObjectId(userIdToShare);
	const chat = await service.shareChat(workspaceId, folderId, chatId, userIdToShare);

	res.status(httpStatus.OK).send(chat);
});
const acceptChatInvite = catchAsync(async (req, res) => {
	const { token } = req.body;
	// const objectId = mongoose.Types.ObjectId(userIdToShare);
	const chat = await service.acceptChatInvite(token);

	res.status(httpStatus.OK).send(chat);
});
const assistantChatUpdate = catchAsync(async (req, res) => {
	const { workspaceId, folderId, chatId } = req.params;
	const { user, body } = req;
	body.sender = user._id;
	if (req.file) {
		const fileType = req.file.mimetype.split("/")[0];
		body.pdfPath = req.file.filename;
		if (fileType === "image") {
			body.media = [{ fileName: req.file.originalname, url: req.file.filename, timestamp: new Date() }];
		} else if (req.file.mimetype === "application/pdf") {
			body.documents = [{ fileName: req.file.originalname, name: req.file.filename, date: new Date(), size: req.file.size }];
		}
	}
	const doc = await service.assistantChatUpdate(workspaceId, folderId, chatId, body);
	console.log("doc", doc);

	res.status(httpStatus.CREATED).send(doc);
});
// const updateChatMessage = catchAsync(async (req, res) => {
//   const { workspaceId, folderId, chatId, messageId } = req.params;
//   const { user, body } = req;
//   // if (req.file) {
//   //   body.pdfPath = req.file.filename;
//   // }
//   body.sender = user._id;
//   if (req.file) {
//     const fileType = req.file.mimetype.split('/')[0];
//     if (fileType === 'image') {
//       body.media = [{ url: req.file.filename, timestamp: new Date() }];
//     } else if (req.file.mimetype === 'application/pdf') {
//       body.documents = [
//         { name: req.file.filename, date: new Date(), size: req.file.size },
//       ];
//     }
//   }
//   const doc = await service.updateChatMessage(
//     workspaceId,
//     folderId,
//     chatId,
//     messageId,
//     body
//   );
//   res.status(httpStatus.CREATED).send(doc);
// });
const deleteAssistantChat = catchAsync(async (req, res) => {
	const { workspaceId, folderId, chatId } = req.params;
	const assessment = await service.deleteAssistantChat(workspaceId, folderId, chatId);
	res.status(httpStatus.CREATED).send(assessment);
});
const UpdateGeneralMessage = catchAsync(async (req, res) => {
	const { id } = req.params;
	const workSpace = await service.UpdateGeneralMessage(id);
	res.status(httpStatus.OK).send(workSpace);
});
const getChatMedia = catchAsync(async (req, res) => {
	const { workspaceId, folderId, chatId } = req.params;
	const media = await service.getChatMedia(workspaceId, folderId, chatId);
	res.status(httpStatus.OK).send(media);
});
const getChatLinks = catchAsync(async (req, res) => {
	const { workspaceId, folderId, chatId } = req.params;
	const links = await service.getChatLinks(workspaceId, folderId, chatId);
	res.status(httpStatus.OK).send(links);
});
const getChatDocuments = catchAsync(async (req, res) => {
	const { workspaceId, folderId, chatId } = req.params;
	const documents = await service.getChatDocuments(workspaceId, folderId, chatId);
	res.status(httpStatus.OK).send(documents);
});
const createComment = catchAsync(async (req, res) => {
	const { workspaceId, folderId, contextId, contextType, messageId } = req.params;
	// const { messageId } = req.body;
	const { user, body } = req;

	body.userId = user._id;
	body.userName = `${user.firstName} ${user.lastName}`;
	body.timestamp = new Date();

	if (contextType === "chat") body.messageId = messageId;

	const comment = await service.createComment(workspaceId, folderId, contextId, messageId, body, contextType);

	res.status(httpStatus.CREATED).send(comment);
});
const getUserChatComments = catchAsync(async (req, res) => {
	console.log("req===", req);
	const userId = req.user._id;
	console.log("userId", userId);
	const bookmarks = await service.getUserChatComments(userId);
	res.status(httpStatus.OK).send(bookmarks);
});
const updateComment = catchAsync(async (req, res) => {
	const { workspaceId, folderId, contextId, contextType, messageId, commentId } = req.params;
	const commentData = req.body;
	const comment = await service.updateComment(
		workspaceId,
		folderId,
		contextId,
		messageId,
		commentId,
		commentData,
		contextType,
	);
	res.status(httpStatus.OK).send(comment);
});
const deleteComment = catchAsync(async (req, res) => {
	const { workspaceId, folderId, chatId, messageId, commentId } = req.params;
	const bookmark = await service.deleteComment(workspaceId, folderId, chatId, messageId, commentId);
	res.status(httpStatus.CREATED).send(bookmark);
});
const bookmarkMessage = catchAsync(async (req, res) => {
	const { workspaceId, folderId, contextId, contextType, messageId } = req.params;
	const { user } = req;
	const bookmark = await service.bookmarkMessage(workspaceId, folderId, contextId, messageId, user._id, contextType);
	res.status(httpStatus.CREATED).send(bookmark);
});
const unbookmarkMessage = catchAsync(async (req, res) => {
	const { workspaceId, folderId, contextId, messageId, bookmarkId, contextType } = req.params;
	const bookmark = await service.unbookmarkMessage(workspaceId, folderId, contextId, messageId, bookmarkId, contextType);
	res.status(httpStatus.OK).send(bookmark);
});
const getBookmarksForUser = catchAsync(async (req, res) => {
	console.log("req===", req);
	const userId = req.user._id;
	console.log("userId", userId);
	const bookmarks = await service.getBookmarksForUser(userId);
	res.status(httpStatus.OK).send(bookmarks);
});
const getBookmarksForChat = catchAsync(async (req, res) => {
	const userId = req.user._id;
	const { workspaceId, folderId, chatId } = req.params;
	const bookmarks = await service.getBookmarksForChat(userId, workspaceId, folderId, chatId);
	res.status(httpStatus.OK).send(bookmarks);
});
const addReplyToComment = catchAsync(async (req, res) => {
	const { workspaceId, folderId, chatId, messageId, commentId } = req.params;
	const { user, body } = req;
	body.userId = user._id;
	body.userName = `${user.firstName} ${user.lastName}`;
	body.timestamp = new Date();
	const reply = await service.addReplyToComment(workspaceId, folderId, chatId, messageId, commentId, body);
	res.status(httpStatus.CREATED).send(reply);
});
const updateReplyInComment = catchAsync(async (req, res) => {
	const { workspaceId, folderId, chatId, messageId, commentId, replyId } = req.params;
	const replyData = req.body;
	const reply = await service.updateReplyInComment(workspaceId, folderId, chatId, messageId, commentId, replyId, replyData);
	res.status(httpStatus.OK).send(reply);
});
const createAssessment = catchAsync(async (req, res) => {
	const { workspaceId, folderId } = req.params;
	const { user, body } = req;

	if (req.file) {
		const fileType = req.file.mimetype;

		if (fileType.startsWith("image/")) {
			body.media = [{ url: req.file.filename, timestamp: new Date() }];
		} else if (fileType === "application/pdf") {
			body.documents = [{ name: req.file.filename, date: new Date(), size: req.file.size }];
		}
	}
	const assessment = await service.createAssessment(workspaceId, folderId, body);
	res.status(httpStatus.CREATED).send(assessment);
});
const updateAssessment = catchAsync(async (req, res) => {
	const { workspaceId, folderId, assessmentId, subReportId } = req.params;
	const { user, body } = req;
	// body.userId = user._id;
	if (req.file) {
		const fileType = req.file.mimetype.split("/")[0];
		if (fileType === "image") {
			body.media = [{ url: req.file.filename, timestamp: new Date() }];
		} else if (req.file.mimetype === "application/pdf") {
			body.documents = [{ name: req.file.filename, date: new Date(), size: req.file.size }];
		}
	}
	const assessment = await service.updateAssessment(workspaceId, folderId, assessmentId, subReportId, body);
	res.status(httpStatus.CREATED).send(assessment);
});
const getAssessment = catchAsync(async (req, res) => {
	const { workspaceId, folderId, assessmentId } = req.params;
	const assessment = await service.getAssessment(workspaceId, folderId, assessmentId);
	res.status(httpStatus.CREATED).send(assessment);
});
const deleteAssessment = catchAsync(async (req, res) => {
	const { workspaceId, folderId, assessmentId } = req.params;
	const assessment = await service.deleteAssessment(workspaceId, folderId, assessmentId);
	res.status(httpStatus.CREATED).send(assessment);
});
const createBusinessInfo = catchAsync(async (req, res) => {
	const { workspaceId, folderId } = req.params;
	const { body } = req;
	const businessInfo = await service.createBusinessInfo(workspaceId, folderId, body);
	res.status(httpStatus.CREATED).send(businessInfo);
});
const getBusinessInfo = catchAsync(async (req, res) => {
	const { workspaceId, folderId, businessInfoId } = req.params;
	const businessInfo = await service.getBusinessInfo(workspaceId, folderId, businessInfoId);
	res.status(httpStatus.OK).send(businessInfo);
});
const updateBusinessInfo = catchAsync(async (req, res) => {
	const { workspaceId, folderId, businessInfoId } = req.params;
	const { body } = req;
	const businessInfo = await service.updateBusinessInfo(workspaceId, folderId, businessInfoId, body);
	res.status(httpStatus.OK).send(businessInfo);
});
const deleteBusinessInfo = catchAsync(async (req, res) => {
	const { workspaceId, folderId, businessInfoId } = req.params;
	const businessInfo = await service.deleteBusinessInfo(workspaceId, folderId, businessInfoId);
	res.status(httpStatus.OK).send(businessInfo);
});
const createSurveyInfo = catchAsync(async (req, res) => {
	const { workspaceId, folderId } = req.params;
	const { body } = req;
	const surveyInfo = await service.createSurveyInfo(workspaceId, folderId, body);
	res.status(httpStatus.CREATED).send(surveyInfo);
});
const getSurveyInfo = catchAsync(async (req, res) => {
	const { workspaceId, folderId } = req.params;
	const surveyInfo = await service.getSurveyInfo(workspaceId, folderId);
	res.status(httpStatus.OK).send(surveyInfo);
});
const updateSurveyInfo = catchAsync(async (req, res) => {
	const { workspaceId, folderId } = req.params;
	const { body } = req;
	const surveyInfo = await service.updateSurveyInfo(workspaceId, folderId, body);
	res.status(httpStatus.OK).send(surveyInfo);
});
const deleteSurveyInfo = catchAsync(async (req, res) => {
	const { workspaceId, folderId } = req.params;
	const surveyInfo = await service.deleteSurveyInfo(workspaceId, folderId);
	res.status(httpStatus.OK).send(surveyInfo);
});
const updateAssistantChat = catchAsync(async (req, res) => {
	const { workspaceId, folderId, chatId } = req.params;
	const { body } = req;
	const updatedAssistantChat = await service.updateAssistantChat(workspaceId, folderId, chatId, body);
	res.status(httpStatus.OK).send(updatedAssistantChat);
});
const moveToTrash = catchAsync(async (req, res) => {
	const { entityType, id } = req.params;

	const updatedEntity = await service.moveEntityToTrash(entityType, id);
	if (updatedEntity) {
		return res.status(httpStatus.CREATED).json({ message: `${entityType} moved to trash successfully!` });
	}

	res.status(httpStatus.NOT_FOUND).json({ message: `${entityType} not found!` });
});
const restoreFromTrash = catchAsync(async (req, res) => {
	const { entityType, id } = req.params;

	const updatedEntity = await service.restoreEntityFromTrash(entityType, id);
	if (updatedEntity) {
		return res.status(httpStatus.CREATED).json({ message: `${entityType} restored from trash successfully!` });
	}
	res.status(httpStatus.NOT_FOUND).json({ message: `${entityType} not found!` });
});
const deleteFromTrash = catchAsync(async (req, res) => {
	const { entityType, id } = req.params;
	const updatedEntity = await service.deleteEntityFromTrash(entityType, id);
	if (updatedEntity) {
		return res.status(httpStatus.CREATED).json({ message: `${entityType} deleted from trash successfully!` });
	}
	res.status(httpStatus.NOT_FOUND).json({ message: `${entityType} not found!` });
});
const getUserTrash = catchAsync(async (req, res) => {
	const { user } = req;
	const { _id: userId } = user;

	const trash = await service.getUserTrash(userId);
	res.status(httpStatus.OK).send(trash);
});
const getCommentsForUser = catchAsync(async (req, res) => {
	const { user } = req;
	const { _id: userId } = user;

	const comments = await service.getCommentsForUser(userId);
	res.status(httpStatus.OK).send(comments);
});
const getUserChats = catchAsync(async (req, res) => {
	const { user } = req;
	const { _id: userId } = user;
	const { query } = req;

	const chat = await service.getUserChats(userId, query);
	res.status(httpStatus.OK).send(chat);
});
const getUserAssessments = catchAsync(async (req, res) => {
	const { user } = req;
	const { _id: userId } = user;
	const { query } = req;
	const assessments = await service.getUserAssessments(userId, query);
	res.status(httpStatus.OK).send(assessments);
});
const getUserSitemaps = catchAsync(async (req, res) => {
	const { user } = req;
	const { _id: userId } = user;
	const { query } = req;
	const sitemaps = await service.getUserSitemaps(userId, query);
	res.status(httpStatus.OK).send(sitemaps);
});
const getUserWireframes = catchAsync(async (req, res) => {
	const { user } = req;
	const { _id: userId } = user;
	const { query } = req;
	const wireframes = await service.getUserWireframes(userId, query);
	res.status(httpStatus.OK).send(wireframes);
});
const addSitemapToWorkspace = catchAsync(async (req, res) => {
	const { workspaceId, folderId } = req.params;
	const { body } = req;
	const sitemap = await service.addSitemapToWorkspace(workspaceId, folderId, body);
	res.status(httpStatus.CREATED).send(sitemap);
});
const getSitemaps = catchAsync(async (req, res) => {
	const { workspaceId, folderId } = req.params;
	const sitemaps = await service.getSitemaps(workspaceId, folderId);
	res.status(httpStatus.OK).send(sitemaps);
});
const getSitemap = catchAsync(async (req, res) => {
	const { workspaceId, folderId, sitemapId } = req.params;
	const sitemap = await service.getSitemap(workspaceId, folderId, sitemapId);
	res.status(httpStatus.OK).send(sitemap);
});
const createWireframe = catchAsync(async (req, res) => {
	const { workspaceId, folderId } = req.params;
	const { body } = req;
	const wireframe = await service.createWireframe(workspaceId, folderId, body);
	res.status(httpStatus.CREATED).send(wireframe);
});
const getWireframes = catchAsync(async (req, res) => {
	const { workspaceId, folderId } = req.params;
	const wireframes = await service.getWireframes(workspaceId, folderId);
	res.status(httpStatus.OK).send(wireframes);
});
const getWireframe = catchAsync(async (req, res) => {
	const { workspaceId, folderId, wireframeId } = req.params;
	const wireframe = await service.getWireframe(workspaceId, folderId, wireframeId);
	res.status(httpStatus.OK).send(wireframe);
});
const updateWireframe = catchAsync(async (req, res) => {
	const { workspaceId, folderId, wireframeId } = req.params;
	const { body } = req;
	const wireframe = await service.updateWireframe(workspaceId, folderId, wireframeId, body);
	res.status(httpStatus.OK).send(wireframe);
});
const deleteWireframe = catchAsync(async (req, res) => {
	const { workspaceId, folderId, wireframeId } = req.params;
	const wireframe = await service.deleteWireframe(workspaceId, folderId, wireframeId);
	res.status(httpStatus.OK).send(wireframe);
});
const createWireframeEntity = catchAsync(async (req, res) => {
	const { workspaceId, folderId, wireframeId } = req.params;
	const { body } = req;
	const wireframe = await service.createWireframeEntity(workspaceId, folderId, wireframeId, body);
	res.status(httpStatus.CREATED).send(wireframe);
});
const bulkCreateWireframeEntity = catchAsync(async (req, res) => {
	const { workspaceId, folderId, wireframeId } = req.params;
	const { body } = req;
	const wireframe = await service.bulkCreateWireframeEntity(workspaceId, folderId, wireframeId, body);
	res.status(httpStatus.CREATED).send(wireframe);
});
const bulkUpdateWireframeEntity = catchAsync(async (req, res) => {
	const { workspaceId, folderId, wireframeId } = req.params;
	const { body } = req;
	const wireframe = await service.bulkUpdateWireframeEntity(workspaceId, folderId, wireframeId, body);
	res.status(httpStatus.CREATED).send(wireframe);
});
const bulkDeleteWireframeEntity = catchAsync(async (req, res) => {
	const { workspaceId, folderId, wireframeId } = req.params;
	const { body } = req;
	const wireframe = await service.bulkDeleteWireframeEntity(workspaceId, folderId, wireframeId, body);
	res.status(httpStatus.CREATED).send(wireframe);
});
const updateWireframeEntity = catchAsync(async (req, res) => {
	const { workspaceId, folderId, wireframeId, entityId } = req.params;
	const { body } = req;
	const wireframe = await service.updateWireframeEntity(workspaceId, folderId, wireframeId, entityId, body);
	res.status(httpStatus.OK).send(wireframe);
});
const deleteWireframeEntity = catchAsync(async (req, res) => {
	const { workspaceId, folderId, wireframeId, entityId } = req.params;
	const wireframe = await service.deleteWireframeEntity(workspaceId, folderId, wireframeId, entityId);
	res.status(httpStatus.OK).send(wireframe);
});
const uploadEntityImage = catchAsync(async (req, res) => {
	const { workspaceId, folderId, wireframeId, entityId } = req.params;
	const { file } = req;

	if (!file) {
		return res.status(httpStatus.BAD_REQUEST).json({ message: "Please upload a file" });
	}

	const wireframe = await service.uploadEntityImage(workspaceId, folderId, wireframeId, entityId, file);
	res.status(httpStatus.OK).send(wireframe);
});
const generateAssessmentReport = catchAsync(async (req, res) => {
	const { workspaceId, folderId, assessmentId } = req.params;
	const assessment = await service.generateAssessmentReport(workspaceId, folderId, assessmentId);
	res.status(httpStatus.OK).send(assessment);
});
const generateAssessmentReports = catchAsync(async (req, res) => {
	const { workspaceId, folderId } = req.params;
	const assessment = await service.generateAssessmentReports(workspaceId, folderId);
	res.status(httpStatus.OK).send(assessment);
});
const getUserDashboardStats = catchAsync(async (req, res) => {
	const { user } = req;
	const { _id: userId } = user;
	const dashboard = await service.getUserDashboardStats(userId);
	res.status(httpStatus.OK).send(dashboard);
});
const getFolderEntities = catchAsync(async (req, res) => {
	const { workspaceId, folderId } = req.params;
	const entities = await service.getFolderEntities(workspaceId, folderId);
	res.status(httpStatus.OK).send(entities);
});
const toggleMessageLike = catchAsync(async (req, res) => {
	const { workspaceId, folderId, chatId, messageId } = req.params;
	const { user } = req;
	const like = await service.toggleMessageLike(workspaceId, folderId, chatId, messageId, user._id);
	res.status(httpStatus.OK).send(like);
});
const toggleMessageDislike = catchAsync(async (req, res) => {
	const { workspaceId, folderId, chatId, messageId } = req.params;
	const { user } = req;
	const dislike = await service.toggleMessageDislike(workspaceId, folderId, chatId, messageId, user._id);
	res.status(httpStatus.OK).send(dislike);
});

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
	UpdateGeneralMessage,
	getChatMedia,
	getChatLinks,
	getChatDocuments,
	createComment,
	updateComment,
	getUserChatComments,
	deleteComment,
	bookmarkMessage,
	unbookmarkMessage,
	getBookmarksForUser,
	getBookmarksForChat,
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
	moveToTrash,
	restoreFromTrash,
	deleteFromTrash,
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
	getUserDashboardStats,
	getFolderEntities,
	toggleMessageLike,
	toggleMessageDislike,
};
