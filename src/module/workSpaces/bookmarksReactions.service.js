const httpStatus = require("http-status");
const ApiError = require("../../utils/ApiError");
const supabase = require("../../config/supabase");

const bookmarkMessage = async (
  workspaceId,
  folderId,
  contextId,
  messageId,
  userId,
  contextType
) => {
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
      const { data, error } = await supabase
        .from("assessment_bookmarks")
        .insert({ assessment_id: contextId, user_id: userId, message_id: messageId })
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

const unbookmarkMessage = async (
  workspaceId,
  folderId,
  contextId,
  messageId,
  bookmarkId,
  contextType
) => {
  try {
    const table = contextType === "assessment" ? "assessment_bookmarks" : "folder_chat_bookmarks";

    const { data } = await supabase.from(table).select("*").eq("id", bookmarkId).single();
    if (!data) throw new ApiError(httpStatus.BAD_REQUEST, "Bookmark not found!");

    await supabase.from(table).delete().eq("id", bookmarkId);
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const getBookmarksForUser = async (userId) => {
  try {
    // Fetch chat bookmarks
    const { data: chatBookmarks } = await supabase
      .from("folder_chat_bookmarks")
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

    const chatResults = (chatBookmarks || []).map((b) => ({
      workspaceId: b.chat?.folder?.workspace_id,
      folderId: b.chat?.folder_id,
      chatId: b.chat_id,
      messageId: b.message_id,
      contextType: "chat",
      bookmark: b,
    }));

    // Fetch assessment bookmarks
    const { data: assessmentBookmarks } = await supabase
      .from("assessment_bookmarks")
      .select(
        `
				*,
				assessment:workspace_assessments(
					id, folder_id, workspace_id
				)
			`
      )
      .eq("user_id", userId);

    const assessmentResults = (assessmentBookmarks || []).map((b) => ({
      workspaceId: b.assessment?.workspace_id,
      folderId: b.assessment?.folder_id,
      assessmentId: b.assessment_id,
      messageId: b.message_id,
      contextType: "assessment",
      bookmark: b,
    }));

    return [...chatResults, ...assessmentResults];
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const getBookmarksForChat = async (userId, workspaceId, folderId, contextId, contextType) => {
  try {
    if (contextType === "assessment") {
      const { data: bookmarks } = await supabase
        .from("assessment_bookmarks")
        .select("*")
        .eq("assessment_id", contextId)
        .eq("user_id", userId);

      return (bookmarks || []).map((b) => ({
        workspaceId,
        folderId,
        assessmentId: contextId,
        messageId: b.message_id,
        contextType: "assessment",
        bookmark: b,
      }));
    }

    const { data: bookmarks } = await supabase
      .from("folder_chat_bookmarks")
      .select("*")
      .eq("chat_id", contextId)
      .eq("user_id", userId);

    return (bookmarks || []).map((b) => ({
      workspaceId,
      folderId,
      chatId: contextId,
      messageId: b.message_id,
      contextType: "chat",
      bookmark: b,
    }));
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const toggleMessageLike = async (workspaceId, folderId, contextId, messageId, userId, contextType) => {
  const reactionsTable =
    contextType === "assessment" ? "assessment_message_reactions" : "chat_message_reactions";
  const messagesTable = contextType === "assessment" ? "assessment_qa" : "folder_chat_messages";
  const reactionsJoin =
    contextType === "assessment"
      ? "reactions:assessment_message_reactions(*)"
      : "reactions:chat_message_reactions(*)";

  // Check for existing reaction
  const { data: existing } = await supabase
    .from(reactionsTable)
    .select("id, type")
    .eq("message_id", messageId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    if (existing.type === "like") {
      await supabase.from(reactionsTable).delete().eq("id", existing.id);
    } else {
      await supabase.from(reactionsTable).update({ type: "like" }).eq("id", existing.id);
    }
  } else {
    await supabase.from(reactionsTable).insert({
      message_id: messageId,
      user_id: userId,
      type: "like",
    });
  }

  // Get message with updated reactions
  const { data: message } = await supabase
    .from(messagesTable)
    .select(`*, ${reactionsJoin}`)
    .eq("id", messageId)
    .single();

  return { success: true, message: "Reaction updated", data: message };
};

const toggleMessageDislike = async (
  workspaceId,
  folderId,
  contextId,
  messageId,
  userId,
  contextType
) => {
  const reactionsTable =
    contextType === "assessment" ? "assessment_message_reactions" : "chat_message_reactions";
  const messagesTable = contextType === "assessment" ? "assessment_qa" : "folder_chat_messages";
  const reactionsJoin =
    contextType === "assessment"
      ? "reactions:assessment_message_reactions(*)"
      : "reactions:chat_message_reactions(*)";

  const { data: existing } = await supabase
    .from(reactionsTable)
    .select("id, type")
    .eq("message_id", messageId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    if (existing.type === "dislike") {
      await supabase.from(reactionsTable).delete().eq("id", existing.id);
    } else {
      await supabase.from(reactionsTable).update({ type: "dislike" }).eq("id", existing.id);
    }
  } else {
    await supabase.from(reactionsTable).insert({
      message_id: messageId,
      user_id: userId,
      type: "dislike",
    });
  }

  const { data: message } = await supabase
    .from(messagesTable)
    .select(`*, ${reactionsJoin}`)
    .eq("id", messageId)
    .single();

  return { success: true, message: "Reaction updated", data: message };
};

module.exports = {
  bookmarkMessage,
  unbookmarkMessage,
  getBookmarksForUser,
  getBookmarksForChat,
  toggleMessageLike,
  toggleMessageDislike,
};

