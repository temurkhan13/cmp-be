const httpStatus = require("http-status");
const ApiError = require("../../utils/ApiError");
const supabase = require("../../config/supabase");

// ─── Trash (Soft Delete / Restore / Permanent Delete) ────────────

const moveEntityToTrash = async (entityType, id) => {
  const handlers = {
    workspace: async () => {
      const { data: ws } = await supabase
        .from("workspaces")
        .select("workspace_name")
        .eq("id", id)
        .single();
      if (!ws) throw new ApiError(httpStatus.NOT_FOUND, "Workspace not found");
      if (ws.workspace_name === "Default Workspace") {
        throw new ApiError(httpStatus.BAD_REQUEST, "Default workspace cannot be moved to trash!");
      }
      const { data } = await supabase
        .from("workspaces")
        .update({ is_soft_deleted: true })
        .eq("id", id)
        .select()
        .single();
      return data;
    },
    folder: async () => {
      const { data: folder } = await supabase
        .from("folders")
        .select("folder_name")
        .eq("id", id)
        .single();
      if (!folder) throw new ApiError(httpStatus.NOT_FOUND, "Folder not found");
      if (folder.folder_name === "Default Folder") {
        throw new ApiError(httpStatus.BAD_REQUEST, "Default folder cannot be moved to trash!");
      }
      const { data } = await supabase
        .from("folders")
        .update({ is_soft_deleted: true })
        .eq("id", id)
        .select()
        .single();
      return data;
    },
    chat: async () => {
      const { data } = await supabase
        .from("folder_chats")
        .update({ is_soft_deleted: true })
        .eq("id", id)
        .select()
        .single();
      return data;
    },
    assessment: async () => {
      const { data } = await supabase
        .from("workspace_assessments")
        .update({ is_soft_deleted: true })
        .eq("id", id)
        .select()
        .single();
      return data;
    },
    sitemap: async () => {
      const { data: sitemap } = await supabase
        .from("digital_playbooks")
        .select("id")
        .eq("id", id)
        .single();
      if (!sitemap) throw new ApiError(httpStatus.NOT_FOUND, "Sitemap not found");
      const { data } = await supabase
        .from("digital_playbooks")
        .update({ is_soft_deleted: true })
        .eq("id", id)
        .select()
        .single();
      return data;
    },
  };
  handlers.sitemaps = handlers.sitemap;

  const handler = handlers[entityType];
  if (!handler) throw new ApiError(httpStatus.BAD_REQUEST, "Invalid entity type");
  return await handler();
};

const restoreEntityFromTrash = async (entityType, id) => {
  switch (entityType) {
    case "workspace": {
      const { data } = await supabase
        .from("workspaces")
        .update({ is_soft_deleted: false })
        .eq("id", id)
        .select()
        .single();
      return data;
    }
    case "folder": {
      const { data } = await supabase
        .from("folders")
        .update({ is_soft_deleted: false })
        .eq("id", id)
        .select()
        .single();
      return data;
    }
    case "chat": {
      const { data } = await supabase
        .from("folder_chats")
        .update({ is_soft_deleted: false })
        .eq("id", id)
        .select()
        .single();
      return data;
    }
    case "assessment": {
      const { data } = await supabase
        .from("workspace_assessments")
        .update({ is_soft_deleted: false })
        .eq("id", id)
        .select()
        .single();
      return data;
    }
    case "sitemap":
    case "sitemaps": {
      const { data } = await supabase
        .from("digital_playbooks")
        .update({ is_soft_deleted: false })
        .eq("id", id)
        .select()
        .single();
      return data;
    }
    default:
      return null;
  }
};

const deleteEntityFromTrash = async (entityType, id) => {
  const handlers = {
    workspace: async () => {
      const { data: ws } = await supabase
        .from("workspaces")
        .select("workspace_name")
        .eq("id", id)
        .single();
      if (!ws) throw new ApiError(httpStatus.NOT_FOUND, "Workspace not found");
      if (ws.workspace_name === "Default Workspace") {
        throw new ApiError(httpStatus.BAD_REQUEST, "Default workspace cannot be deleted!");
      }
      await supabase.from("workspaces").delete().eq("id", id);
      return { success: true };
    },
    folder: async () => {
      const { data: folder } = await supabase
        .from("folders")
        .select("folder_name")
        .eq("id", id)
        .single();
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
      await supabase.from("workspace_assessments").delete().eq("id", id);
      return { success: true };
    },
    sitemap: async () => {
      const { data: playbook } = await supabase
        .from("digital_playbooks")
        .select("id")
        .eq("id", id)
        .single();
      if (!playbook) throw new ApiError(httpStatus.NOT_FOUND, "Sitemap not found");

      // Cascade delete all child records
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
      return { success: true };
    },
  };
  handlers.sitemaps = handlers.sitemap;

  const handler = handlers[entityType];
  if (!handler) throw new ApiError(httpStatus.BAD_REQUEST, "Invalid entity type");
  return await handler();
};

const getUserTrash = async (userId) => {
  // Get trashed workspaces
  const { data: trashedWorkspaces } = await supabase
    .from("workspaces")
    .select("id, workspace_name, workspace_description, updated_at")
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
        .select("id, folder_name, updated_at")
        .in("workspace_id", wsIds)
        .eq("is_soft_deleted", true)
    : { data: [] };

  // Get all folder IDs
  const { data: allFolders } = wsIds.length
    ? await supabase.from("folders").select("id").in("workspace_id", wsIds)
    : { data: [] };
  const folderIds = (allFolders || []).map((f) => f.id);

  // Get trashed chats
  const { data: trashedChats } = folderIds.length
    ? await supabase
        .from("folder_chats")
        .select("id, chat_title, updated_at")
        .in("folder_id", folderIds)
        .eq("is_soft_deleted", true)
    : { data: [] };

  // Get trashed assessments
  const { data: trashedAssessments } = folderIds.length
    ? await supabase
        .from("workspace_assessments")
        .select("id, name, updated_at")
        .in("folder_id", folderIds)
        .eq("is_soft_deleted", true)
    : { data: [] };

  // Get trashed sitemaps
  const { data: trashedSitemaps } = await supabase
    .from("digital_playbooks")
    .select("id, name, updated_at")
    .eq("user_id", userId)
    .eq("is_soft_deleted", true);

  const formatDate = (d) => (d ? new Date(d).toLocaleDateString() : "Unknown Date");

  return {
    workspaces: (trashedWorkspaces || []).map((w) => ({
      workspaceName: w.workspace_name,
      workspaceDescription: w.workspace_description,
      _id: w.id,
      dateDeleted: formatDate(w.updated_at),
    })),
    folders: (trashedFolders || []).map((f) => ({
      folderName: f.folder_name,
      _id: f.id,
      dateDeleted: formatDate(f.updated_at),
    })),
    chats: (trashedChats || []).map((c) => ({
      chatTitle: c.chat_title,
      _id: c.id,
      dateDeleted: formatDate(c.updated_at),
    })),
    assessments: (trashedAssessments || []).map((a) => ({
      assessmentTitle: a.name || "Assessment",
      _id: a.id,
      dateDeleted: formatDate(a.updated_at),
    })),
    sitemaps: (trashedSitemaps || []).map((s) => ({
      sitemapTitle: s.name || "Sitemap",
      _id: s.id,
      dateDeleted: formatDate(s.updated_at),
    })),
  };
};

module.exports = {
  moveEntityToTrash,
  restoreEntityFromTrash,
  deleteEntityFromTrash,
  getUserTrash,
};
