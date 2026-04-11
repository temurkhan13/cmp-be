const httpStatus = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const service = require("./service");
const pick = require("../../utils/pick");

const create = catchAsync(async (req, res) => {
	const { body, user } = req;
	// Map user_id from frontend or fall back to authenticated user
	body.userId = body.userId || body.user_id || user._id;
	const sitemap = await service.create(body);
	res.status(httpStatus.OK).send(sitemap);
});
const querySitemaps = catchAsync(async (req, res) => {
	// const user = req.user._id;
	const filter = pick(req.query, []);
	// const filter = { user };
	const options = pick(req.query, ["page", "limit"]);
	const workSpace = await service.querySitemaps(filter, options);
	res.status(httpStatus.OK).send(workSpace);
});
const getSitemap = catchAsync(async (req, res) => {
	const { id } = req.params;
	const sitemap = await service.getSitemap(id);
	res.status(httpStatus.OK).send(sitemap);
});
const updateSitemap = catchAsync(async (req, res) => {
	const { body } = req;
	const { id } = req.params;
	// body.user = user._id;
	const sitemap = await service.updateSitemap(id, body);
	res.status(httpStatus.OK).send(sitemap);
});
const deleteSitemap = catchAsync(async (req, res) => {
	const { id } = req.params;
	// body.user = user._id;
	const sitemap = await service.deleteSitemap(id);
	res.status(httpStatus.OK).send(sitemap);
});
const updateSitemapFields = catchAsync(async (req, res) => {
	const { id } = req.params;
	const updateBody = req.body;
	const updatedSitemap = await service.updateSitemapFields(id, updateBody);
	res.status(httpStatus.OK).send(updatedSitemap);
});
const wireFrame = catchAsync(async (req, res) => {
	const { body } = req;
	//   body.user = user._id;
	const wireframe = await service.wireFrame(body);
	res.status(httpStatus.OK).send(wireframe);
});
const createComment = catchAsync(async (req, res) => {
	const { playbookId, stageId, nodeId, nodeDataId } = req.params;
	const { user, body } = req;
	// body.userId = user._id;
	// body.userName = `${user.firstName} ${user.lastName}`;
	body.userName = "zain";
	body.timestamp = new Date();

	const comment = await service.createComment(playbookId, stageId, nodeId, nodeDataId, body);
	res.status(httpStatus.CREATED).send(comment);
});
const updateComment = catchAsync(async (req, res) => {
	const { playbookId, stageId, nodeId, nodeDataId, commentId } = req.params;
	const commentData = req.body;

	const comment = await service.updateComment(playbookId, stageId, nodeId, nodeDataId, commentId, commentData);
	res.status(httpStatus.OK).send(comment);
});
const deleteComment = catchAsync(async (req, res) => {
	const { playbookId, stageId, nodeId, nodeDataId, commentId } = req.params;

	await service.deleteComment(playbookId, stageId, nodeId, nodeDataId, commentId);
	res.status(httpStatus.NO_CONTENT).send();
});
const createReply = catchAsync(async (req, res) => {
	const { playbookId, stageId, nodeId, nodeDataId, commentId } = req.params;
	const { user, body } = req;
	body.userId = user._id;
	body.userName = `${user.firstName} ${user.lastName}`;
	body.timestamp = new Date();

	const reply = await service.createReply(playbookId, stageId, nodeId, nodeDataId, commentId, body);
	res.status(httpStatus.CREATED).send(reply);
});
const updateReply = catchAsync(async (req, res) => {
	const { playbookId, stageId, nodeId, nodeDataId, commentId, replyId } = req.params;
	const replyData = req.body;

	const reply = await service.updateReply(playbookId, stageId, nodeId, nodeDataId, commentId, replyId, replyData);
	res.status(httpStatus.OK).send(reply);
});
const deleteReply = catchAsync(async (req, res) => {
	const { playbookId, stageId, nodeId, nodeDataId, commentId, replyId } = req.params;

	await service.deleteReply(playbookId, stageId, nodeId, nodeDataId, commentId, replyId);
	res.status(httpStatus.NO_CONTENT).send();
});
const deleteStage = catchAsync(async (req, res) => {
	const { playbookId, stageId } = req.params;
	const result = await service.deleteStage(playbookId, stageId);
	res.status(httpStatus.OK).send(result);
});
const convertSitemapToPlaybook = catchAsync(async (req, res) => {
	const { sitemapId } = req.params;
	const userId = req.user._id || req.user.id;
	const playbook = await service.convertSitemapToPlaybook(sitemapId, userId);
	res.status(httpStatus.CREATED).send(playbook);
});
const inspire = catchAsync(async (req, res) => {
	const { body, user } = req;
	body.userId = body.userId || body.user_id || user._id;
	const result = await service.inspire(body);
	res.status(httpStatus.OK).send(result);
});
const simpleUpdate = catchAsync(async (req, res) => {
	const { id } = req.params;
	const updatedSitemap = await service.simpleUpdate(id, req.body);
	res.status(httpStatus.OK).send(updatedSitemap);
});
const addNode = catchAsync(async (req, res) => {
	const { playbookId, stageId } = req.params;
	const newNode = await service.addNode(playbookId, stageId, req.body);
	res.status(httpStatus.CREATED).send(newNode);
});
const addNodeData = catchAsync(async (req, res) => {
	const { playbookId, stageId, nodeId } = req.params;
	const newNodeData = await service.addNodeData(playbookId, stageId, nodeId, req.body);
	res.status(httpStatus.CREATED).send(newNodeData);
});
const updateNodeData = catchAsync(async (req, res) => {
	const { playbookId, stageId, nodeId, nodeDataId } = req.params;
	const updatedNodeData = await service.updateNodeData(playbookId, stageId, nodeId, nodeDataId, req.body);
	res.status(httpStatus.OK).send(updatedNodeData);
});
const updateType = catchAsync(async (req, res) => {
	const { playbookId, stageId, type, typeId } = req.params;
	const updatedType = await service.updateType(playbookId, stageId, type, typeId, req.body);
	res.status(httpStatus.OK).send(updatedType);
});

module.exports = {
	create,
	querySitemaps,
	getSitemap,
	updateSitemap,
	deleteSitemap,
	updateSitemapFields,
	wireFrame,
	createComment,
	updateComment,
	deleteComment,
	createReply,
	updateReply,
	deleteReply,
	inspire,
	deleteStage,
	convertSitemapToPlaybook,
	simpleUpdate,
	addNode,
	addNodeData,
	updateNodeData,
	updateType,
};
