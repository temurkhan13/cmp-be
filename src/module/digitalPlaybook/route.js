const express = require("express");
const controller = require("./controller");
const auth = require("../../middlewares/auth");
const checkSubscription = require("../../middlewares/checkSubscription");

const router = express.Router();

router
	.route("/sitemap")
	.post(checkSubscription({ checkSitemap: true }), controller.create)
	.get(controller.querySitemaps);
router.route("/sitemap/:id").get(controller.getSitemap).patch(controller.updateSitemap).delete(controller.deleteSitemap);
router.patch("/update/sitemap/:id", controller.updateSitemapFields);
router.post("/wireframe", controller.wireFrame);
router.post("/sitemap/:playbookId/stage/:stageId/node/:nodeId/nodedata/:nodeDataId/comment", controller.createComment);
router.patch("/sitemap/simple-update/:id", controller.simpleUpdate);
router.post("/:playbookId/stage/:stageId/nodes", auth(), controller.addNode);
router.post("/:playbookId/stage/:stageId/nodes/:nodeId/nodeData", auth(), controller.addNodeData);
router.patch("/:playbookId/stage/:stageId/nodes/:nodeId/nodeData/:nodeDataId", auth(), controller.updateNodeData);
router.patch("/:playbookId/stage/:stageId/:type/:typeId", controller.updateType);

router
	.route("/sitemap/:playbookId/stage/:stageId/node/:nodeId/nodedata/:nodeDataId/comment/:commentId")
	.patch(auth(), controller.updateComment)
	.delete(auth(), controller.deleteComment);

router
	.route("/sitemap/:playbookId/stage/:stageId/node/:nodeId/nodedata/:nodeDataId/comment/:commentId/reply")
	.post(auth(), controller.createReply);

router
	.route("/sitemap/:playbookId/stage/:stageId/node/:nodeId/nodedata/:nodeDataId/comment/:commentId/reply/:replyId")
	.patch(auth(), controller.updateReply)
	.delete(auth(), controller.deleteReply);

module.exports = {
	dpbRoutes: router,
};
