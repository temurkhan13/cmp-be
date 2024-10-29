const express = require("express");
const controller = require("./controller");
// const validation = require('./validation');
const auth = require("../../middlewares/auth");
const { fileUpload } = require("../../utils/fileUpload");
const checkSubscription = require("../../middlewares/checkSubscription");

const router = express.Router();

router
	.route("/")
	.post(auth(), checkSubscription({ checkWorkspace: true }), controller.create)
	.get(auth(), controller.query);
router.route("/:id").get(auth(), controller.get).patch(auth(), controller.update).delete(auth(), controller.deleteWorkspace);

router.post("/:workspaceId/folder", auth(), checkSubscription({ checkProject: true }), controller.createFolder);

router
	.route("/:workspaceId/folder/:folderId")
	.patch(auth(), controller.updateFolder)
	.delete(auth(), controller.deleteFolder);

router.get("/:workspaceId/folder/:folderId", auth(), controller.getFolderEntities);

router.post("/:workspaceId/folder/:folderId/chat", auth(), controller.assistantChat);

router
	.route("/:workspaceId/folder/:folderId/chat/:chatId")
	.get(auth(), controller.getAssistantChat)
	.patch(auth(), controller.updateAssistantChat)
	.delete(auth(), controller.deleteAssistantChat);

router.post("/:workspaceId/folder/:folderId/chat/:chatId/share", auth(), controller.shareChat);
router.post("/invite/accept", controller.acceptChatInvite);

router.patch(
	"/:workspaceId/folder/:folderId/chat/:chatId/message",
	auth(),
	fileUpload.single("pdfPath"),
	checkSubscription({ checkWordLimit: true, wordCountField: "text" }),
	controller.assistantChatUpdate,
);

router.get("/:workspaceId/folder/:folderId/chat/:chatId/media", auth(), controller.getChatMedia);
router.get("/:workspaceId/folder/:folderId/chat/:chatId/links", auth(), controller.getChatLinks);

router.get("/:workspaceId/folder/:folderId/chat/:chatId/documents", auth(), controller.getChatDocuments);

// router.post(
//   '/:workspaceId/folder/:folderId/chat/:chatId/message/:messageId/comment',
//   auth(),
//   controller.createComment
// );

router.post(
	"/:workspaceId/folder/:folderId/:contextType/:contextId/message/:messageId/comment",
	auth(),
	controller.createComment,
);
router
	.route("/:workspaceId/folder/:folderId/:contextType/:contextId/message/:messageId/comment/:commentId")
	.get(auth(), controller.getUserChatComments)
	.patch(
		// '/:workspaceId/folder/:folderId/:contextType/:contextId/message/:messageId/comment/:commentId',
		auth(),
		controller.updateComment,
	)
	.delete(auth(), controller.deleteComment);

router.post(
	"/:workspaceId/folder/:folderId/chat/:chatId/message/:messageId/toggle-like",
	auth(),
	controller.toggleMessageLike,
);
router.post(
	"/:workspaceId/folder/:folderId/chat/:chatId/message/:messageId/toggle-dislike",
	auth(),
	controller.toggleMessageDislike,
);

router.post(
	"/:workspaceId/folder/:folderId/:contextType/:contextId/message/:messageId/bookmark",
	auth(),
	controller.bookmarkMessage,
);
router.delete(
	"/:workspaceId/folder/:folderId/:contextType/:contextId/message/:messageId/bookmark/:bookmarkId",
	auth(),
	controller.unbookmarkMessage,
);
router.get("/user/bookmarks", auth(), controller.getBookmarksForUser);
router.get("/user/comments", auth(), controller.getCommentsForUser);
router.get("/:workspaceId/folder/:folderId/chat/:chatId/bookmarks", auth(), controller.getBookmarksForChat);

router.post(
	"/:workspaceId/folder/:folderId/chat/:chatId/message/:messageId/comment/:commentId/reply",
	auth(),
	controller.addReplyToComment,
);
router.patch(
	"/:workspaceId/folder/:folderId/chat/:chatId/message/:messageId/comment/:commentId/reply/:replyId",
	auth(),
	controller.updateReplyInComment,
);
router.post(
	"/:workspaceId/folder/:folderId/assessment",
	auth(),
	fileUpload.single("file"),
	checkSubscription({ checkWordLimit: true, wordCountField: "assessmentName" }),
	controller.createAssessment,
);
router
	.route("/:workspaceId/folder/:folderId/assessment/:assessmentId/subReport/:subReportId")
	.patch(
		auth(),
		fileUpload.single("file"),
		checkSubscription({ checkWordLimit: true, wordCountField: "content" }),
		controller.updateAssessment,
	)
	.get(auth(), controller.getAssessment)
	.delete(auth(), controller.deleteAssessment);

router.post("/:workspaceId/folder/:folderId/assessment/:assessmentId/reports", auth(), controller.generateAssessmentReport);
router.post("/:workspaceId/folder/:folderId/assessment/reports", auth(), controller.generateAssessmentReports);

router.route("/:workspaceId/folder/:folderId/businessInfo").post(auth(), controller.createBusinessInfo);
router
	.route("/:workspaceId/folder/:folderId/businessInfo/:businessInfoId")
	.get(auth(), controller.getBusinessInfo)
	.patch(auth(), controller.updateBusinessInfo)
	.delete(auth(), controller.deleteBusinessInfo);

router
	.route("/:workspaceId/folder/:folderId/surveyInfo")
	.post(auth(), controller.createSurveyInfo)
	.get(auth(), controller.getSurveyInfo)
	.patch(auth(), controller.updateSurveyInfo)
	.delete(auth(), controller.deleteSurveyInfo);

router.patch("/:entityType/:id/moveToTrash", auth(), controller.moveToTrash);
router.patch("/:entityType/:id/restoreFromTrash", auth(), controller.restoreFromTrash);
router.delete("/:entityType/:id/deleteFromTrash", auth(), controller.deleteFromTrash);
router.get("/user/trash", auth(), controller.getUserTrash);
router.get("/user/chats", auth(), controller.getUserChats);
router.get("/user/assessments", auth(), controller.getUserAssessments);
router.get("/user/sitemaps", auth(), controller.getUserSitemaps);
router.get("/user/wireframes", auth(), controller.getUserWireframes);
router.get("/user/dashboard-stats", auth(), controller.getUserDashboardStats);

// sitemaps
router
	.route("/:workspaceId/folder/:folderId/sitemap")
	.post(auth(), controller.addSitemapToWorkspace)
	.get(auth(), controller.getSitemaps);
router.route("/:workspaceId/folder/:folderId/sitemap/:sitemapId").get(auth(), controller.getSitemap);

// wireframes
router
	.route("/:workspaceId/folder/:folderId/wireframe")
	.post(auth(), checkSubscription({ checkWireframe: true }), controller.createWireframe)
	.get(auth(), controller.getWireframes);
router
	.route("/:workspaceId/folder/:folderId/wireframe/:wireframeId")
	.get(auth(), controller.getWireframe)
	.patch(auth(), controller.updateWireframe)
	.delete(auth(), controller.deleteWireframe);

router.route("/:workspaceId/folder/:folderId/wireframe/:wireframeId/entity").post(auth(), controller.createWireframeEntity);
router
	.route("/:workspaceId/folder/:folderId/wireframe/:wireframeId/entity/bulk")
	.post(auth(), controller.bulkCreateWireframeEntity);
router.post(
	"/:workspaceId/folder/:folderId/wireframe/:wireframeId/entity/bulk/update",
	auth(),
	controller.bulkUpdateWireframeEntity,
);
router.post(
	"/:workspaceId/folder/:folderId/wireframe/:wireframeId/entity/bulk/delete",
	auth(),
	controller.bulkDeleteWireframeEntity,
);
router.delete;
router
	.route("/:workspaceId/folder/:folderId/wireframe/:wireframeId/entity/:entityId")
	.patch(auth(), controller.updateWireframeEntity)
	.delete(auth(), controller.deleteWireframeEntity);
router.post(
	"/:workspaceId/folder/:folderId/wireframe/:wireframeId/entity/:entityId/upload",
	auth(),
	fileUpload.single("image"),
	controller.uploadEntityImage,
);

module.exports = {
	workspaceRoutes: router,
};
