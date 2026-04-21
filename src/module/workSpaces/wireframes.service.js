const httpStatus = require("http-status");
const ApiError = require("../../utils/ApiError");
const supabase = require("../../config/supabase");
const { default: axios } = require("axios");
const config = require("../../config/config");
const { isArrayWithLength, parseJsonIfPossible } = require("../../common/global.functions");
const { assignPageAndLayoutIndexes } = require("./helper");

// ─── Wireframe CRUD ──────────────────────────────────────────────

const createWireframe = async (workspaceId, folderId, body) => {
  const { sitemapId, title } = body;

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("user_id")
    .eq("id", workspaceId)
    .single();
  if (!workspace) throw new ApiError(httpStatus.BAD_REQUEST, "Workspace or Folder not found!");

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
    .single();
  if (!sitemap) throw new ApiError(httpStatus.BAD_REQUEST, "Sitemap not found!");

  const initialBody = {
    user_id: workspace.user_id,
    message: sitemap.message,
    wireframe_name: title,
    sitemap_body: sitemap,
  };
  const gptResponse = await axios.post(`${config.baseUrl}/wireframe`, initialBody);
  const response = gptResponse.data;

  const parsedMessage = parseJsonIfPossible(response.message);
  const wireframeNameArray = parsedMessage[title];
  const updatedWireframeLayout = assignPageAndLayoutIndexes(wireframeNameArray, 4, 4);

  // Create wireframe
  const { data: wireframe, error: wfErr } = await supabase
    .from("folder_wireframes")
    .insert({
      folder_id: folderId,
      sitemap_id: sitemapId,
      title,
    })
    .select()
    .single();
  if (wfErr) throw new ApiError(httpStatus.BAD_REQUEST, wfErr.message);

  // Create entities
  if (isArrayWithLength(updatedWireframeLayout)) {
    const entityRows = updatedWireframeLayout.map((e) => ({
      wireframe_id: wireframe.id,
      element: e.element,
      layout: e.layout,
      text: e.text,
      description: e.description,
      image: e.image,
      type: e.type,
      chart_type: e.chartType,
      page_index: e.pageIndex,
      layout_index: e.layoutIndex,
      styles: e.styles || null,
      description_styles: e.descriptionStyles || null,
      table_data: e.tableData || null,
      chart_data: e.chartData || null,
    }));
    await supabase.from("folder_wireframe_entities").insert(entityRows);
  }

  // Fetch complete wireframe with entities
  const { data: fullWireframe } = await supabase
    .from("folder_wireframes")
    .select("*, entities:folder_wireframe_entities(*)")
    .eq("id", wireframe.id)
    .single();

  return {
    success: true,
    message: "Wireframe created successfully",
    data: fullWireframe,
  };
};

const getWireframes = async (workspaceId, folderId) => {
  const { data: folder } = await supabase
    .from("folders")
    .select("id")
    .eq("id", folderId)
    .eq("workspace_id", workspaceId)
    .single();
  if (!folder) throw new ApiError(httpStatus.BAD_REQUEST, "Folder not found!");

  const { data: wireframes } = await supabase
    .from("folder_wireframes")
    .select("*")
    .eq("folder_id", folderId);
  return wireframes || [];
};

const getWireframe = async (workspaceId, folderId, wireframeId) => {
  const { data: wireframe } = await supabase
    .from("folder_wireframes")
    .select(
      `
			*,
			entities:folder_wireframe_entities(
				*,
				elements:folder_wireframe_elements(*),
				shapes:folder_wireframe_shapes(*)
			),
			comments:folder_wireframe_comments(*)
		`
    )
    .eq("id", wireframeId)
    .eq("folder_id", folderId)
    .single();
  if (!wireframe) throw new ApiError(httpStatus.BAD_REQUEST, "Wireframe not found!");
  return wireframe;
};

const updateWireframe = async (workspaceId, folderId, wireframeId, body) => {
  const mapped = {};
  if (body.title !== undefined) mapped.title = body.title;
  if (body.sitemapId !== undefined) mapped.sitemap_id = body.sitemapId;

  const { data, error } = await supabase
    .from("folder_wireframes")
    .update(mapped)
    .eq("id", wireframeId)
    .eq("folder_id", folderId)
    .select()
    .single();
  if (error || !data) throw new ApiError(httpStatus.BAD_REQUEST, "Wireframe not found!");

  return { success: true, message: "Wireframe updated successfully", data };
};

const deleteWireframe = async (workspaceId, folderId, wireframeId) => {
  const { data: wf } = await supabase
    .from("folder_wireframes")
    .select("id")
    .eq("id", wireframeId)
    .eq("folder_id", folderId)
    .single();
  if (!wf) throw new ApiError(httpStatus.BAD_REQUEST, "Wireframe not found!");

  await supabase.from("folder_wireframes").delete().eq("id", wireframeId);
  return { success: true, message: "Wireframe deleted successfully" };
};

// ─── Wireframe Entity CRUD ───────────────────────────────────────

const createWireframeEntity = async (workspaceId, folderId, wireframeId, body) => {
  const { data: wf } = await supabase
    .from("folder_wireframes")
    .select("id")
    .eq("id", wireframeId)
    .eq("folder_id", folderId)
    .single();
  if (!wf) throw new ApiError(httpStatus.BAD_REQUEST, "Wireframe not found!");

  const { data, error } = await supabase
    .from("folder_wireframe_entities")
    .insert({
      wireframe_id: wireframeId,
      element: body.element,
      layout: body.layout,
      text: body.text,
      description: body.description,
      image: body.image,
      type: body.type,
      chart_type: body.chartType,
      page_index: body.pageIndex,
      layout_index: body.layoutIndex,
      styles: body.styles || null,
      description_styles: body.descriptionStyles || null,
      table_data: body.tableData || null,
      chart_data: body.chartData || null,
    })
    .select()
    .single();
  if (error) throw new ApiError(httpStatus.BAD_REQUEST, error.message);

  return { success: true, message: "Wireframe entity created successfully", data };
};

const bulkCreateWireframeEntity = async (workspaceId, folderId, wireframeId, body) => {
  const { data: wf } = await supabase
    .from("folder_wireframes")
    .select("id")
    .eq("id", wireframeId)
    .eq("folder_id", folderId)
    .single();
  if (!wf) throw new ApiError(httpStatus.BAD_REQUEST, "Wireframe not found!");

  const rows = body.map((e) => ({
    wireframe_id: wireframeId,
    element: e.element,
    layout: e.layout,
    text: e.text,
    description: e.description,
    image: e.image,
    type: e.type,
    chart_type: e.chartType,
    page_index: e.pageIndex,
    layout_index: e.layoutIndex,
    styles: e.styles || null,
    description_styles: e.descriptionStyles || null,
    table_data: e.tableData || null,
    chart_data: e.chartData || null,
  }));

  const { data, error } = await supabase.from("folder_wireframe_entities").insert(rows).select();
  if (error) throw new ApiError(httpStatus.BAD_REQUEST, error.message);

  return { success: true, message: "Wireframe entities created successfully", data };
};

const bulkUpdateWireframeEntity = async (workspaceId, folderId, wireframeId, body) => {
  const { data: wf } = await supabase
    .from("folder_wireframes")
    .select("id")
    .eq("id", wireframeId)
    .eq("folder_id", folderId)
    .single();
  if (!wf) throw new ApiError(httpStatus.BAD_REQUEST, "Wireframe not found!");

  const updatedEntities = [];
  for (const entity of body) {
    const mapped = {};
    if (entity.element !== undefined) mapped.element = entity.element;
    if (entity.layout !== undefined) mapped.layout = entity.layout;
    if (entity.text !== undefined) mapped.text = entity.text;
    if (entity.description !== undefined) mapped.description = entity.description;
    if (entity.image !== undefined) mapped.image = entity.image;
    if (entity.type !== undefined) mapped.type = entity.type;
    if (entity.chartType !== undefined) mapped.chart_type = entity.chartType;
    if (entity.pageIndex !== undefined) mapped.page_index = entity.pageIndex;
    if (entity.layoutIndex !== undefined) mapped.layout_index = entity.layoutIndex;
    if (entity.styles !== undefined) mapped.styles = entity.styles;
    if (entity.descriptionStyles !== undefined)
      mapped.description_styles = entity.descriptionStyles;
    if (entity.tableData !== undefined) mapped.table_data = entity.tableData;
    if (entity.chartData !== undefined) mapped.chart_data = entity.chartData;

    const { data } = await supabase
      .from("folder_wireframe_entities")
      .update(mapped)
      .eq("id", entity.id)
      .eq("wireframe_id", wireframeId)
      .select()
      .single();
    if (data) updatedEntities.push(data);
  }

  return {
    success: true,
    message: "Wireframe entities updated successfully",
    data: updatedEntities,
  };
};

const bulkDeleteWireframeEntity = async (workspaceId, folderId, wireframeId, entityIds) => {
  const { data: wf } = await supabase
    .from("folder_wireframes")
    .select("id")
    .eq("id", wireframeId)
    .eq("folder_id", folderId)
    .single();
  if (!wf) throw new ApiError(httpStatus.BAD_REQUEST, "Wireframe not found!");

  await supabase
    .from("folder_wireframe_entities")
    .delete()
    .in("id", entityIds)
    .eq("wireframe_id", wireframeId);

  return { success: true, message: "Wireframe entities deleted successfully" };
};

const updateWireframeEntity = async (workspaceId, folderId, wireframeId, entityId, body) => {
  const mapped = {};
  if (body.element !== undefined) mapped.element = body.element;
  if (body.layout !== undefined) mapped.layout = body.layout;
  if (body.text !== undefined) mapped.text = body.text;
  if (body.description !== undefined) mapped.description = body.description;
  if (body.image !== undefined) mapped.image = body.image;
  if (body.type !== undefined) mapped.type = body.type;
  if (body.chartType !== undefined) mapped.chart_type = body.chartType;
  if (body.pageIndex !== undefined) mapped.page_index = body.pageIndex;
  if (body.layoutIndex !== undefined) mapped.layout_index = body.layoutIndex;
  if (body.styles !== undefined) mapped.styles = body.styles;
  if (body.descriptionStyles !== undefined) mapped.description_styles = body.descriptionStyles;
  if (body.tableData !== undefined) mapped.table_data = body.tableData;
  if (body.chartData !== undefined) mapped.chart_data = body.chartData;

  const { data, error } = await supabase
    .from("folder_wireframe_entities")
    .update(mapped)
    .eq("id", entityId)
    .eq("wireframe_id", wireframeId)
    .select()
    .single();
  if (error || !data) throw new ApiError(httpStatus.BAD_REQUEST, "Entity not found!");

  return { success: true, message: "Wireframe entity updated successfully", data };
};

const deleteWireframeEntity = async (workspaceId, folderId, wireframeId, entityId) => {
  const { data } = await supabase
    .from("folder_wireframe_entities")
    .select("id")
    .eq("id", entityId)
    .eq("wireframe_id", wireframeId)
    .single();
  if (!data) throw new ApiError(httpStatus.BAD_REQUEST, "Entity not found!");

  await supabase.from("folder_wireframe_entities").delete().eq("id", entityId);
  return { success: true, message: "Wireframe entity deleted successfully" };
};

const uploadEntityImage = async (workspaceId, folderId, wireframeId, entityId, file) => {
  const { data, error } = await supabase
    .from("folder_wireframe_entities")
    .update({ image: file.filename })
    .eq("id", entityId)
    .eq("wireframe_id", wireframeId)
    .select()
    .single();
  if (error || !data) throw new ApiError(httpStatus.BAD_REQUEST, "Entity not found!");

  return {
    success: true,
    message: "Wireframe entity image uploaded successfully",
    data,
    image: file.filename,
  };
};

// ─── User Aggregation: Wireframes ───────────────────────────────

const getUserWireframes = async (userId, query) => {
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

  let wireframeQuery = supabase.from("folder_wireframes").select("*").in("folder_id", folderIds);

  if (query.wireframeId) wireframeQuery = wireframeQuery.eq("id", query.wireframeId);

  const { data: wireframes } = await wireframeQuery;

  return (wireframes || []).map((w) => ({
    workspaceId: folderMap[w.folder_id]?.workspace_id,
    folderId: w.folder_id,
    ...w,
  }));
};

module.exports = {
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
  uploadEntityImage,
  getUserWireframes,
};
