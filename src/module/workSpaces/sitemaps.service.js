const httpStatus = require("http-status");
const ApiError = require("../../utils/ApiError");
const supabase = require("../../config/supabase");

// ─── Sitemap Operations ─────────────────────────────────────────

const addSitemapToWorkspace = async (workspaceId, folderId, body) => {
  const { sitemapId } = body;

  const { data: folder } = await supabase
    .from("folders")
    .select("id")
    .eq("id", folderId)
    .eq("workspace_id", workspaceId)
    .single();
  if (!folder) throw new ApiError(httpStatus.BAD_REQUEST, "Folder not found!");

  await supabase.from("folder_sitemap_references").insert({
    folder_id: folderId,
    sitemap_id: sitemapId,
  });

  return { success: true, message: "Sitemap added successfully" };
};

const getSitemaps = async (workspaceId, folderId) => {
  const { data: folder } = await supabase
    .from("folders")
    .select("id")
    .eq("id", folderId)
    .eq("workspace_id", workspaceId)
    .single();
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
    .in("id", sitemapIds)
    .eq("is_soft_deleted", false);

  return sitemaps || [];
};

const getSitemap = async (workspaceId, folderId, sitemapId) => {
  const { data: folder } = await supabase
    .from("folders")
    .select("id")
    .eq("id", folderId)
    .eq("workspace_id", workspaceId)
    .single();
  if (!folder) throw new ApiError(httpStatus.BAD_REQUEST, "Folder not found!");

  const { data: sitemap } = await supabase
    .from("digital_playbooks")
    .select("*")
    .eq("id", sitemapId)
    .eq("is_soft_deleted", false)
    .single();
  if (!sitemap) throw new ApiError(httpStatus.BAD_REQUEST, "Sitemap not found!");
  return sitemap;
};

// ─── User Aggregation: Sitemaps ─────────────────────────────────

const getUserSitemaps = async (userId, query) => {
  let folderQuery = supabase.from("folders").select("id, workspace_id");

  if (query.workspaceId) {
    folderQuery = folderQuery.eq("workspace_id", query.workspaceId);
  } else {
    const { data: workspaces } = await supabase
      .from("workspaces")
      .select("id")
      .eq("user_id", userId);
    if (!workspaces || workspaces.length === 0)
      throw new ApiError(httpStatus.NOT_FOUND, "No workspaces found for this user");
    folderQuery = folderQuery.in(
      "workspace_id",
      workspaces.map((w) => w.id)
    );
  }
  if (query.folderId) folderQuery = folderQuery.eq("id", query.folderId);

  const { data: folders } = await folderQuery;
  if (!folders || folders.length === 0) return [];

  const folderIds = folders.map((f) => f.id);
  const folderMap = {};
  folders.forEach((f) => {
    folderMap[f.id] = f;
  });

  const { data: refs } = await supabase
    .from("folder_sitemap_references")
    .select("*, sitemap:sitemap_id(*)")
    .in("folder_id", folderIds);

  return (refs || [])
    .filter((r) => r.sitemap && r.sitemap.is_soft_deleted === false)
    .map((r) => ({
      workspaceId: folderMap[r.folder_id]?.workspace_id,
      folderId: r.folder_id,
      ...r.sitemap,
      _id: r.sitemap?.id,
      updatedAt: r.sitemap?.updated_at,
      createdAt: r.sitemap?.created_at,
    }));
};

module.exports = {
  addSitemapToWorkspace,
  getSitemaps,
  getSitemap,
  getUserSitemaps,
};
