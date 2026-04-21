const httpStatus = require("http-status");
const ApiError = require("../../utils/ApiError");
const supabase = require("../../config/supabase");

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

const createFolder = async (workspaceId, folder) => {
  try {
    const { data: ws } = await supabase
      .from("workspaces")
      .select("id")
      .eq("id", workspaceId)
      .single();
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

const getFolderEntities = async (workspaceId, folderId) => {
  const { data: ws } = await supabase
    .from("workspaces")
    .select("workspace_name")
    .eq("id", workspaceId)
    .eq("is_soft_deleted", false)
    .single();
  if (!ws) return [];

  const { data: folder } = await supabase
    .from("folders")
    .select("id, folder_name")
    .eq("id", folderId)
    .eq("workspace_id", workspaceId)
    .eq("is_soft_deleted", false)
    .single();
  if (!folder) return [];

  const { data: chats } = await supabase
    .from("folder_chats")
    .select("id, chat_title, created_at")
    .eq("folder_id", folderId)
    .eq("is_soft_deleted", false)
    .order("created_at", { ascending: false })
    .limit(5);

  const { data: assessments } = await supabase
    .from("workspace_assessments")
    .select("id, name, created_at")
    .eq("folder_id", folderId)
    .eq("is_soft_deleted", false)
    .order("created_at", { ascending: false })
    .limit(5);

  const { data: wireframes } = await supabase
    .from("folder_wireframes")
    .select("id, title, created_at")
    .eq("folder_id", folderId)
    .order("created_at", { ascending: false })
    .limit(5);

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
      .in("id", sitemapIds)
      .eq("is_soft_deleted", false);
    sitemaps = (sitemapData || []).map((s) => ({
      id: s.id,
      name: s.name,
      createdAt: s.created_at,
    }));
  }

  return [
    {
      workspaceName: ws.workspace_name,
      folderName: folder.folder_name,
      chats: (chats || []).map((c) => ({
        id: c.id,
        chatTitle: c.chat_title,
        createdAt: c.created_at,
      })),
      assessments: (assessments || []).map((a) => ({
        id: a.id,
        name: a.name || "Assessment",
        createdAt: a.created_at,
      })),
      wireframes: (wireframes || []).map((w) => ({
        id: w.id,
        title: w.title,
        createdAt: w.created_at,
      })),
      sitemaps,
    },
  ];
};

module.exports = {
  createFolder,
  updateFolder,
  deleteFolder,
  getFolderEntities,
};

