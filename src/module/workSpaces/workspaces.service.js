const httpStatus = require("http-status");
const ApiError = require("../../utils/ApiError");
const supabase = require("../../config/supabase");
const paginate = require("../../utils/paginate");

// Local formatters (duplicated from legacy service to keep this module standalone)
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

const formatWorkspace = (ws) => {
  if (!ws) return null;
  return {
    ...ws,
    _id: ws.id,
    workspaceName: ws.workspace_name,
    workspaceDescription: ws.workspace_description,
    userId: ws.user_id,
    isActive: ws.is_active,
    isSoftDeleted: ws.is_soft_deleted,
    createdAt: ws.created_at,
    updatedAt: ws.updated_at,
    folders: (ws.folders || []).map(formatFolder),
  };
};

const create = async (body) => {
  const { data, error } = await supabase
    .from("workspaces")
    .insert({
      workspace_name: body.workspaceName,
      workspace_description: body.workspaceDescription,
      user_id: body.userId,
      is_active: body.isActive ?? true,
    })
    .select()
    .single();
  if (error || !data) throw new ApiError(httpStatus.BAD_REQUEST, "something went wrong!");
  return formatWorkspace(data);
};

const query = async (filter, options) => {
  const paginateFilter = {};
  if (filter.userId) paginateFilter.user_id = filter.userId;
  if (filter.isSoftDeleted !== undefined) paginateFilter.is_soft_deleted = filter.isSoftDeleted;
  const result = await paginate("workspaces", { ...options, filter: paginateFilter }, supabase);
  if (result.results) {
    result.results = result.results.map(formatWorkspace);
  }
  return result;
};

const get = async (id) => {
  const { data, error } = await supabase
    .from("workspaces")
    .select("*")
    .eq("id", id)
    .eq("is_soft_deleted", false)
    .single();
  if (error || !data) throw new ApiError(httpStatus.BAD_REQUEST, "No workspace found!");
  return formatWorkspace(data);
};

const update = async (id, updateBody) => {
  const mapped = {};
  if (updateBody.workspaceName !== undefined) mapped.workspace_name = updateBody.workspaceName;
  if (updateBody.workspaceDescription !== undefined)
    mapped.workspace_description = updateBody.workspaceDescription;
  if (updateBody.isActive !== undefined) mapped.is_active = updateBody.isActive;
  if (updateBody.isSoftDeleted !== undefined) mapped.is_soft_deleted = updateBody.isSoftDeleted;

  const { data, error } = await supabase
    .from("workspaces")
    .update(mapped)
    .eq("id", id)
    .select()
    .single();
  if (error || !data) throw new ApiError(httpStatus.BAD_REQUEST, "No workspace found!");
  return formatWorkspace(data);
};

const deleteWorkspace = async (id) => {
  const { data: ws } = await supabase
    .from("workspaces")
    .select("workspace_name")
    .eq("id", id)
    .single();
  if (!ws) throw new ApiError(httpStatus.BAD_REQUEST, "No workspace found!");
  if (ws.workspace_name === "Default Workspace")
    throw new ApiError(httpStatus.BAD_REQUEST, "Cannot delete Default workspace!");

  const { error } = await supabase.from("workspaces").delete().eq("id", id);
  if (error) throw new ApiError(httpStatus.BAD_REQUEST, error.message);
  return { success: true, message: "Workspace deleted successfully" };
};

const createDefaultWorkspace = async (userId) => {
  const { data: existing } = await supabase
    .from("workspaces")
    .select("*")
    .eq("user_id", userId)
    .eq("workspace_name", "Default Workspace")
    .maybeSingle();

  if (existing) return existing;

  const { data: workspace, error } = await supabase
    .from("workspaces")
    .insert({
      user_id: userId,
      workspace_name: "Default Workspace",
      workspace_description: "This is your default workspace",
      is_active: true,
    })
    .select()
    .single();
  if (error) throw new ApiError(httpStatus.BAD_REQUEST, error.message);

  await supabase.from("folders").insert({
    workspace_id: workspace.id,
    folder_name: "Default Folder",
    is_active: true,
  });

  return workspace;
};

const getUserDashboardStats = async (userId) => {
  const { data: workspaces } = await supabase
    .from("workspaces")
    .select("id, workspace_name, workspace_description, is_active")
    .eq("user_id", userId)
    .eq("is_soft_deleted", false);

  if (!workspaces)
    return {
      activeWorkspace: "No Active Workspace",
      activeProject: "No Active Project",
      activeSubscription: "Free",
      totalWorkspaces: 0,
      totalProjects: 0,
      workspaces: [],
    };

  const wsIds = workspaces.map((w) => w.id);

  const { data: folders } = wsIds.length
    ? await supabase
        .from("folders")
        .select("id, workspace_id, folder_name, is_active")
        .in("workspace_id", wsIds)
        .eq("is_soft_deleted", false)
    : { data: [] };

  const activeWorkspace = workspaces.find((w) => w.is_active);
  const totalWorkspaces = workspaces.length;

  const activeFolders = (folders || []).filter((f) => f.workspace_id === activeWorkspace?.id);
  const activeProject = activeFolders.find((f) => f.is_active);
  const totalProjects = (folders || []).length;

  const foldersByWs = {};
  (folders || []).forEach((f) => {
    if (!foldersByWs[f.workspace_id]) foldersByWs[f.workspace_id] = [];
    foldersByWs[f.workspace_id].push({
      id: f.id,
      folderName: f.folder_name,
      isActive: f.is_active,
    });
  });

  const workspaceDetails = workspaces.map((w) => ({
    id: w.id,
    workspaceName: w.workspace_name,
    workspaceDescription: w.workspace_description,
    isActive: w.is_active,
    folders: foldersByWs[w.id] || [],
  }));

  return {
    activeWorkspace: activeWorkspace?.workspace_name || "No Active Workspace",
    activeProject: activeProject?.folder_name || "No Active Project",
    activeSubscription: "Free",
    totalWorkspaces,
    totalProjects,
    workspaces: workspaceDetails,
  };
};

module.exports = {
  create,
  query,
  get,
  update,
  deleteWorkspace,
  createDefaultWorkspace,
  getUserDashboardStats,
};

