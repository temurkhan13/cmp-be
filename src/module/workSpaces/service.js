// ─── Façade: re-exports from domain service modules ─────────────
// This file preserves the original API surface so all consumers
// (controller.js, route.js, etc.) continue to require("./service").

const workspacesService = require("./workspaces.service");
const foldersService = require("./folders.service");
const chatsService = require("./chats.service");
const commentsService = require("./comments.service");
const bookmarksReactionsService = require("./bookmarksReactions.service");
const trashService = require("./trash.service");
const assessmentsLegacyService = require("./assessments-legacy.service");
const sitemapsService = require("./sitemaps.service");
const wireframesService = require("./wireframes.service");

module.exports = {
  // Workspaces
  create: workspacesService.create,
  query: workspacesService.query,
  get: workspacesService.get,
  update: workspacesService.update,
  deleteWorkspace: workspacesService.deleteWorkspace,
  createDefaultWorkspace: workspacesService.createDefaultWorkspace,
  getUserDashboardStats: workspacesService.getUserDashboardStats,

  // Folders
  createFolder: foldersService.createFolder,
  updateFolder: foldersService.updateFolder,
  deleteFolder: foldersService.deleteFolder,
  getFolderEntities: foldersService.getFolderEntities,

  // Chats
  assistantChat: chatsService.assistantChat,
  getFolderChats: chatsService.getFolderChats,
  getAssistantChat: chatsService.getAssistantChat,
  shareChat: chatsService.shareChat,
  acceptChatInvite: chatsService.acceptChatInvite,
  uploadChatAttachment: chatsService.uploadChatAttachment,
  assistantChatUpdate: chatsService.assistantChatUpdate,
  updateAssistantChat: chatsService.updateAssistantChat,
  updateMessageText: chatsService.updateMessageText,
  deleteAssistantChat: chatsService.deleteAssistantChat,
  getChatMedia: chatsService.getChatMedia,
  getChatLinks: chatsService.getChatLinks,
  getChatDocuments: chatsService.getChatDocuments,
  moveChatToFolderOfSameWorkspace: chatsService.moveChatToFolderOfSameWorkspace,
  getUserChats: chatsService.getUserChats,

  // Comments + replies
  createComment: commentsService.createComment,
  updateComment: commentsService.updateComment,
  getUserChatComments: commentsService.getUserChatComments,
  deleteComment: commentsService.deleteComment,
  addReplyToComment: commentsService.addReplyToComment,
  updateReplyInComment: commentsService.updateReplyInComment,
  deleteReplyFromComment: commentsService.deleteReplyFromComment,
  getCommentsForUser: commentsService.getCommentsForUser,

  // Bookmarks + reactions
  bookmarkMessage: bookmarksReactionsService.bookmarkMessage,
  unbookmarkMessage: bookmarksReactionsService.unbookmarkMessage,
  getBookmarksForChat: bookmarksReactionsService.getBookmarksForChat,
  getBookmarksForUser: bookmarksReactionsService.getBookmarksForUser,
  toggleMessageLike: bookmarksReactionsService.toggleMessageLike,
  toggleMessageDislike: bookmarksReactionsService.toggleMessageDislike,

  // Trash
  moveEntityToTrash: trashService.moveEntityToTrash,
  restoreEntityFromTrash: trashService.restoreEntityFromTrash,
  deleteEntityFromTrash: trashService.deleteEntityFromTrash,
  getUserTrash: trashService.getUserTrash,

  // Assessments + business/survey info + reports
  createAssessment: assessmentsLegacyService.createAssessment,
  updateAssessment: assessmentsLegacyService.updateAssessment,
  getAssessment: assessmentsLegacyService.getAssessment,
  deleteAssessment: assessmentsLegacyService.deleteAssessment,
  createBusinessInfo: assessmentsLegacyService.createBusinessInfo,
  getBusinessInfo: assessmentsLegacyService.getBusinessInfo,
  updateBusinessInfo: assessmentsLegacyService.updateBusinessInfo,
  deleteBusinessInfo: assessmentsLegacyService.deleteBusinessInfo,
  createSurveyInfo: assessmentsLegacyService.createSurveyInfo,
  getSurveyInfo: assessmentsLegacyService.getSurveyInfo,
  updateSurveyInfo: assessmentsLegacyService.updateSurveyInfo,
  deleteSurveyInfo: assessmentsLegacyService.deleteSurveyInfo,
  generateAssessmentReport: assessmentsLegacyService.generateAssessmentReport,
  generateAssessmentReports: assessmentsLegacyService.generateAssessmentReports,
  getUserAssessments: assessmentsLegacyService.getUserAssessments,

  // Sitemaps
  addSitemapToWorkspace: sitemapsService.addSitemapToWorkspace,
  getSitemaps: sitemapsService.getSitemaps,
  getSitemap: sitemapsService.getSitemap,
  getUserSitemaps: sitemapsService.getUserSitemaps,

  // Wireframes + entities
  createWireframe: wireframesService.createWireframe,
  getWireframes: wireframesService.getWireframes,
  getWireframe: wireframesService.getWireframe,
  updateWireframe: wireframesService.updateWireframe,
  deleteWireframe: wireframesService.deleteWireframe,
  createWireframeEntity: wireframesService.createWireframeEntity,
  bulkCreateWireframeEntity: wireframesService.bulkCreateWireframeEntity,
  bulkUpdateWireframeEntity: wireframesService.bulkUpdateWireframeEntity,
  bulkDeleteWireframeEntity: wireframesService.bulkDeleteWireframeEntity,
  updateWireframeEntity: wireframesService.updateWireframeEntity,
  deleteWireframeEntity: wireframesService.deleteWireframeEntity,
  uploadEntityImage: wireframesService.uploadEntityImage,
  getUserWireframes: wireframesService.getUserWireframes,
};
