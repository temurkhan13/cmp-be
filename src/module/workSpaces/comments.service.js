const httpStatus = require("http-status");
const ApiError = require("../../utils/ApiError");
const supabase = require("../../config/supabase");

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
  contextType
) => {
  try {
    const table = _getCommentsTable(contextType);
    if (!table) throw new ApiError(httpStatus.BAD_REQUEST, "Invalid context type!");

    const row = {
      user_id: commentData.userId,
      user_name: commentData.userName,
      text: commentData.text,
      status: commentData.status || "active",
    };

    if (contextType === "chat") {
      const { data: chat } = await supabase
        .from("folder_chats")
        .select("id")
        .eq("id", contextId)
        .single();
      if (!chat) throw new ApiError(httpStatus.BAD_REQUEST, "Chat not found!");
      row.chat_id = contextId;
      row.message_id = messageId;
    } else if (contextType === "assessment") {
      row.chat_id = contextId;
      row.message_id = messageId;
    } else if (contextType === "wireframe") {
      const { data: wf } = await supabase
        .from("folder_wireframes")
        .select("id")
        .eq("id", contextId)
        .single();
      if (!wf) throw new ApiError(httpStatus.BAD_REQUEST, "Wireframe not found!");
      row.wireframe_id = contextId;
    }

    const { data: newComment, error } = await supabase.from(table).insert(row).select().single();
    if (error) throw new ApiError(httpStatus.BAD_REQUEST, error.message);

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
      .select(
        `
				*,
				chat:folder_chats(
					id, folder_id,
					folder:folders(id, workspace_id)
				)
			`
      )
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

const updateComment = async (
  workspaceId,
  folderId,
  contextId,
  messageId,
  commentId,
  commentData,
  contextType
) => {
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
    const { error } = await supabase.from("folder_chat_comments").delete().eq("id", commentId);
    if (error) throw new ApiError(httpStatus.BAD_REQUEST, error.message);
    return { success: true, message: "Comment deleted successfully" };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.BAD_REQUEST, `Error deleting comment: ${error.message}`);
  }
};

const addReplyToComment = async (
  workspaceId,
  folderId,
  chatId,
  messageId,
  commentId,
  replyData
) => {
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

const updateReplyInComment = async (
  workspaceId,
  folderId,
  chatId,
  messageId,
  commentId,
  replyId,
  replyData
) => {
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

const deleteReplyFromComment = async (
  workspaceId,
  folderId,
  chatId,
  messageId,
  commentId,
  replyId
) => {
  try {
    const { error } = await supabase
      .from("folder_chat_comment_replies")
      .delete()
      .eq("id", replyId)
      .eq("comment_id", commentId);
    if (error) throw new ApiError(httpStatus.BAD_REQUEST, error.message);
    return { success: true };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

// ─── User Aggregation: Comments ─────────────────────────────────

const getCommentsForUser = async (userId) => {
  const { data: comments } = await supabase
    .from("folder_chat_comments")
    .select(
      `
			*,
			chat:folder_chats(
				id, folder_id,
				folder:folders(id, workspace_id)
			)
		`
    )
    .eq("user_id", userId);

  return (comments || []).map((c) => ({
    workspaceId: c.chat?.folder?.workspace_id,
    folderId: c.chat?.folder_id,
    chatId: c.chat_id,
    messageId: c.message_id,
    comment: c,
  }));
};

module.exports = {
  createComment,
  getUserChatComments,
  updateComment,
  deleteComment,
  addReplyToComment,
  updateReplyInComment,
  deleteReplyFromComment,
  getCommentsForUser,
};

