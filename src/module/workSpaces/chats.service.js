const httpStatus = require("http-status");
const ApiError = require("../../utils/ApiError");
const supabase = require("../../config/supabase");
const { default: axios } = require("axios");
const config = require("../../config/config");
const logger = require("../../config/logger");
const jwt = require("jsonwebtoken");
const { sendInviteEmail } = require("../../utils/emailService");
const { makeAxiosCall, isArrayWithLength } = require("../../common/global.functions");

const generateInviteLink = (workspaceId, folderId, chatId, email) => {
  const inviteToken = jwt.sign({ workspaceId, folderId, chatId, email }, config.jwt.secret, {
    expiresIn: "7d",
  });
  return `${config.frontendUrl}/invite?token=${inviteToken}`;
};

const getChatFromAI = async (data) => {
  const gptURL = `${config.baseUrl}/chat`;
  return await makeAxiosCall({ url: gptURL, method: "POST", data });
};

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
    const { data: folder } = await supabase
      .from("folders")
      .select("id")
      .eq("id", folderId)
      .eq("workspace_id", workspaceId)
      .single();
    if (!folder)
      throw new ApiError(httpStatus.BAD_REQUEST, "Workspace, Folder, or chat not found!");

    const { data: chat } = await supabase
      .from("folder_chats")
      .select("*")
      .eq("id", chatId)
      .eq("folder_id", folderId)
      .single();
    if (!chat) throw new ApiError(httpStatus.BAD_REQUEST, "Chat not found!");
    if (chat.is_soft_deleted)
      throw new ApiError(httpStatus.NOT_FOUND, "Chat is soft-deleted and not available.");

    const { data: messages } = await supabase
      .from("folder_chat_messages")
      .select("*, reactions:chat_message_reactions(*)")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true });

    const { data: comments } = await supabase
      .from("folder_chat_comments")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true });

    const { data: bookmarks } = await supabase
      .from("folder_chat_bookmarks")
      .select("*")
      .eq("chat_id", chatId);

    const commentIds = (comments || []).map((c) => c.id);
    let repliesByComment = {};
    if (commentIds.length > 0) {
      const { data: replies } = await supabase
        .from("folder_chat_comment_replies")
        .select("*")
        .in("comment_id", commentIds)
        .order("created_at", { ascending: true });
      (replies || []).forEach((r) => {
        if (!repliesByComment[r.comment_id]) repliesByComment[r.comment_id] = [];
        repliesByComment[r.comment_id].push({
          ...r,
          _id: r.id,
          replyId: r.id,
          userName: r.user_name,
          userId: r.user_id,
        });
      });
    }

    const commentsByMessage = {};
    (comments || []).forEach((c) => {
      if (!commentsByMessage[c.message_id]) commentsByMessage[c.message_id] = [];
      commentsByMessage[c.message_id].push({
        ...c,
        _id: c.id,
        messageId: c.message_id,
        userId: c.user_id,
        userName: c.user_name,
        replies: repliesByComment[c.id] || [],
      });
    });

    const mapReactions = (reactions) =>
      (reactions || []).map((r) => ({
        ...r,
        _id: r.id,
        user: r.user_id,
        messageId: r.message_id,
      }));

    chat.generalMessages = (messages || []).map((m) => ({
      ...m,
      _id: m.id,
      sender: m.from,
      reactions: mapReactions(m.reactions),
      comments: commentsByMessage[m.id] || [],
    }));
    chat.bookmarks = (bookmarks || []).map((b) => ({
      ...b,
      _id: b.id,
      messageId: b.message_id,
      userId: b.user_id,
    }));
    return chat;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.BAD_REQUEST, `Error retrieving chat: ${error.message}`);
  }
};

const updateMessageText = async (workspaceId, folderId, chatId, messageId, body) => {
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

const deleteAssistantChat = async (workspaceId, folderId, chatId) => {
  try {
    const { data: folder } = await supabase
      .from("folders")
      .select("id")
      .eq("id", folderId)
      .eq("workspace_id", workspaceId)
      .single();
    if (!folder)
      throw new ApiError(httpStatus.BAD_REQUEST, "Workspace, Folder, or Chat not found!");

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
      return {
        success: true,
        message: "Chat soft deleted. Please make another request to permanently delete.",
      };
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Error deleting chat: ${error.message}`);
  }
};

const getChatMedia = async (workspaceId, folderId, chatId) => {
  try {
    const { data: folder } = await supabase
      .from("folders")
      .select("id")
      .eq("id", folderId)
      .eq("workspace_id", workspaceId)
      .single();
    if (!folder) throw new ApiError(httpStatus.BAD_REQUEST, "Workspace, Folder, or Chat not found!");

    const { data: media } = await supabase
      .from("folder_chat_media")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: false });
    return media || [];
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Error fetching chat media: ${error.message}`);
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
    if (!folder) throw new ApiError(httpStatus.BAD_REQUEST, "Workspace, Folder, or Chat not found!");

    const { data: links } = await supabase
      .from("folder_chat_links")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: false });
    return links || [];
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Error fetching chat links: ${error.message}`);
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
    if (!folder) throw new ApiError(httpStatus.BAD_REQUEST, "Workspace, Folder, or Chat not found!");

    const { data: docs } = await supabase
      .from("folder_chat_documents")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: false });
    return docs || [];
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Error fetching chat documents: ${error.message}`
    );
  }
};

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
    if (error || !data)
      throw new ApiError(httpStatus.BAD_REQUEST, "Workspace, Folder, or Chat not found!");

    return { success: true, message: "Assistant chat updated successfully", data };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Error updating assistant chat: ${error.message}`
    );
  }
};

const shareChat = async (workspaceId, folderId, chatId, userIdToShare) => {
  const { data: chat } = await supabase
    .from("folder_chats")
    .select("id, folder_id")
    .eq("id", chatId)
    .single();
  if (!chat) throw new ApiError(httpStatus.NOT_FOUND, "Workspace, Folder, or Chat not found!");

  const { data: existing } = await supabase
    .from("folder_chat_shared_users")
    .select("id")
    .eq("chat_id", chatId)
    .eq("user_id", userIdToShare)
    .maybeSingle();
  if (existing) throw new ApiError(httpStatus.BAD_REQUEST, "User already has access to this chat.");

  const { data: user } = await supabase
    .from("users")
    .select("id, email")
    .eq("id", userIdToShare)
    .single();
  if (!user) throw new ApiError(httpStatus.NOT_FOUND, "User not found!");

  const inviteLink = generateInviteLink(workspaceId, folderId, chatId, user.email);
  await sendInviteEmail(user.email, inviteLink);

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
    const { chatId, email } = decoded;

    const { data: user } = await supabase.from("users").select("id").eq("email", email).single();
    if (!user) throw new ApiError(httpStatus.BAD_REQUEST, "User not found");

    const { data: chat } = await supabase.from("folder_chats").select("id").eq("id", chatId).single();
    if (!chat) throw new ApiError(httpStatus.NOT_FOUND, "Workspace or chat not found");

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

const uploadChatAttachment = async (file) => {
  const fileName = `${Date.now()}-${file.originalname}`;
  const { error } = await supabase.storage.from("chat-attachments").upload(fileName, file.buffer, {
    contentType: file.mimetype,
    upsert: true,
  });
  if (error) throw new ApiError(httpStatus.BAD_REQUEST, `File upload failed: ${error.message}`);
  const { data: urlData } = supabase.storage.from("chat-attachments").getPublicUrl(fileName);
  return urlData.publicUrl;
};

const assistantChatUpdate = async (workspaceId, folderId, chatId, messageData) => {
  let newChatId = null;
  try {
    const { data: folder } = await supabase
      .from("folders")
      .select("id, workspace_id")
      .eq("id", folderId)
      .eq("workspace_id", workspaceId)
      .single();
    if (!folder) throw new ApiError(httpStatus.BAD_REQUEST, "Workspace or Folder not found!");

    // NEW CHAT branch
    if (chatId === "newChat") {
      const chatTitle = messageData.text
        ? messageData.text.substring(0, 60).replace(/\n/g, " ") + (messageData.text.length > 60 ? "..." : "")
        : "New Chat";

      const { data: newChat, error: chatErr } = await supabase
        .from("folder_chats")
        .insert({ folder_id: folderId, chat_title: chatTitle })
        .select()
        .single();
      if (chatErr) throw new ApiError(httpStatus.BAD_REQUEST, chatErr.message);

      newChatId = newChat.id;

      await supabase
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
          url: messageData.pdfPath || null,
          date: d.date || null,
          size: d.size || null,
        }));
        await supabase.from("folder_chat_documents").insert(docRows);
      }

      if (messageData.text) {
        const urlRegex = /https?:\/\/[^\s<>"')\]]+/gi;
        const foundUrls = messageData.text.match(urlRegex);
        if (foundUrls && foundUrls.length > 0) {
          const linkRows = foundUrls.map((url) => {
            try {
              return { chat_id: newChat.id, name: new URL(url).hostname, url };
            } catch {
              return { chat_id: newChat.id, name: url, url };
            }
          });
          await supabase.from("folder_chat_links").insert(linkRows);
        }
      }

      const body = {
        user_id: String(messageData.sender || ""),
        chat_id: String(newChat.id),
        message: messageData.text || "",
        history: [],
      };

      const chatFromAI = await getChatFromAI(body);

      if (Object.keys(chatFromAI || {}).length > 0) {
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
        text: chatFromAI?.message,
      };
    }

    // EXISTING CHAT branch
    const { data: chat } = await supabase
      .from("folder_chats")
      .select("id")
      .eq("id", chatId)
      .eq("folder_id", folderId)
      .single();
    if (!chat) throw new ApiError(httpStatus.BAD_REQUEST, "Chat not found!");

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
        url: messageData.pdfPath || null,
        date: d.date || null,
        size: d.size || null,
      }));
      await supabase.from("folder_chat_documents").insert(docRows);
    }

    if (messageData.text) {
      const urlRegex = /https?:\/\/[^\s<>"')\]]+/gi;
      const foundUrls = messageData.text.match(urlRegex);
      logger.debug(`Link extraction — found ${foundUrls ? foundUrls.length : 0} URLs`);
      if (foundUrls && foundUrls.length > 0) {
        const linkRows = foundUrls.map((url) => {
          try {
            return { chat_id: chatId, name: new URL(url).hostname, url };
          } catch {
            return { chat_id: chatId, name: url, url };
          }
        });
        const { error: linkErr } = await supabase.from("folder_chat_links").insert(linkRows);
        if (linkErr) logger.error("Link insert error:", linkErr.message);
      }
    }

    let fileContent = "";
    if (messageData.fileBuffer) {
      try {
        const pathMod = require("path");
        const ext = pathMod.extname(messageData.fileOriginalName || "").toLowerCase();
        if (ext === ".pdf") {
          try {
            const pdfParse = require("pdf-parse");
            const pdfData = await pdfParse(messageData.fileBuffer);
            fileContent = pdfData.text || "";
          } catch (pdfErr) {
            logger.warn("PDF parse error:", pdfErr.message);
          }
        } else if (ext === ".docx") {
          try {
            const mammoth = require("mammoth");
            const result = await mammoth.extractRawText({ buffer: messageData.fileBuffer });
            fileContent = result.value || "";
          } catch (docxErr) {
            logger.warn("DOCX parse error:", docxErr.message);
          }
        } else {
          try {
            fileContent = messageData.fileBuffer.toString("utf-8");
          } catch {
            fileContent = messageData.fileBuffer
              .toString("utf-8")
              .replace(/[^\x20-\x7E\n\r\t]/g, " ")
              .trim();
          }
        }
        if (fileContent.length > 30000) {
          fileContent = fileContent.substring(0, 30000) + "\n[...truncated...]";
        }
        logger.info(`File read from buffer: ${messageData.fileOriginalName} (${fileContent.length} chars)`);
      } catch (e) {
        logger.warn("File read error:", e.message);
      }

      if (fileContent) {
        try {
          await axios.post(`${config.baseUrl}/ingest`, {
            user_id: String(messageData.sender),
            workspace_id: "",
            folder_id: "",
            filename: messageData.fileOriginalName,
            content: fileContent,
          });
        } catch (e) {
          logger.info("RAG ingest skipped:", e.message);
        }
      }
    }

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
        ? `The user uploaded a document. Here is its content:\n\n${fileContent}\n\nUser question: ${
            messageData.text || "Please analyze and summarize this document."
          }`
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
        result.file = messageData?.media?.at(0) || messageData?.documents?.at(0);
      }

      return result;
    } catch {
      throw new Error("AI server error");
    }
  } catch (error) {
    // Compensating write: if we created a new chat and later failed, clean it up
    if (newChatId) {
      try {
        await supabase.from("folder_chat_links").delete().eq("chat_id", newChatId);
        await supabase.from("folder_chat_media").delete().eq("chat_id", newChatId);
        await supabase.from("folder_chat_documents").delete().eq("chat_id", newChatId);
        await supabase.from("folder_chat_messages").delete().eq("chat_id", newChatId);
        await supabase.from("folder_chats").delete().eq("id", newChatId);
      } catch (cleanupErr) {
        logger.warn(`Failed to rollback new chat ${newChatId}: ${cleanupErr.message}`);
      }
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const moveChatToFolderOfSameWorkspace = async (workspaceId, sourceFolderId, chatId, newFolderId) => {
  const { data: chat } = await supabase
    .from("folder_chats")
    .select("id")
    .eq("id", chatId)
    .eq("folder_id", sourceFolderId)
    .single();
  if (!chat) throw new ApiError(httpStatus.NOT_FOUND, "Workspace, Folder, or Chat not found");

  const { data: targetFolder } = await supabase
    .from("folders")
    .select("id")
    .eq("id", newFolderId)
    .eq("workspace_id", workspaceId)
    .single();
  if (!targetFolder) throw new ApiError(httpStatus.NOT_FOUND, "Target folder not found in workspace");

  await supabase.from("folder_chats").update({ folder_id: newFolderId }).eq("id", chatId);
  return { success: true, message: "Chat moved successfully" };
};

// ─── User Aggregation: Chats ────────────────────────────────────

const getUserChats = async (userId, query) => {
  // Build folder filter
  let folderQuery = supabase.from("folders").select("id, workspace_id");

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
    folderQuery = folderQuery.in(
      "workspace_id",
      workspaces.map((w) => w.id)
    );
  }

  if (query.folderId) {
    folderQuery = folderQuery.eq("id", query.folderId);
  }

  const { data: folders } = await folderQuery;
  if (!folders || folders.length === 0) return [];

  const folderIds = folders.map((f) => f.id);
  const folderMap = {};
  folders.forEach((f) => {
    folderMap[f.id] = f;
  });

  const { data: chats } = await supabase
    .from("folder_chats")
    .select("*")
    .in("folder_id", folderIds)
    .order("created_at", { ascending: false });

  // Auto-fix titles for chats still named "New Chat"
  const newChatIds = (chats || []).filter((c) => c.chat_title === "New Chat").map((c) => c.id);
  const firstMessages = {};
  if (newChatIds.length > 0) {
    // Single batched query instead of N+1
    const { data: rawMsgs } = await supabase
      .from("folder_chat_messages")
      .select("chat_id, text, created_at")
      .in("chat_id", newChatIds)
      .eq("from", "user")
      .order("created_at", { ascending: true });

    // Keep only the first message per chat and update titles in one pass
    const seenChats = new Set();
    const titlesToUpdate = [];
    for (const msg of rawMsgs || []) {
      if (!seenChats.has(msg.chat_id) && msg.text) {
        seenChats.add(msg.chat_id);
        const title =
          msg.text.substring(0, 60).replace(/\n/g, " ") + (msg.text.length > 60 ? "..." : "");
        firstMessages[msg.chat_id] = title;
        titlesToUpdate.push({ id: msg.chat_id, chat_title: title });
      }
    }
    // Batch update titles
    for (const { id, chat_title } of titlesToUpdate) {
      await supabase.from("folder_chats").update({ chat_title }).eq("id", id);
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

module.exports = {
  getFolderChats,
  assistantChat,
  getAssistantChat,
  updateAssistantChat,
  deleteAssistantChat,
  updateMessageText,
  getChatMedia,
  getChatLinks,
  getChatDocuments,
  shareChat,
  acceptChatInvite,
  uploadChatAttachment,
  assistantChatUpdate,
  moveChatToFolderOfSameWorkspace,
  getUserChats,
};

