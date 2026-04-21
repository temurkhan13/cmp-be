const express = require("express");
const controller = require("./controller");
const auth = require("../../middlewares/auth");
const checkSubscription = require("../../middlewares/checkSubscription");

const router = express.Router();

router
  .route("/sitemap")
  .post(auth(), checkSubscription({ checkSitemap: true }), controller.create)
  .get(auth(), controller.querySitemaps);
router
  .route("/sitemap/:id")
  .get(auth(), controller.getSitemap)
  .patch(auth(), controller.updateSitemap)
  .delete(auth(), controller.deleteSitemap);
router.patch("/update/sitemap/:id", auth(), controller.updateSitemapFields);
router.post("/wireframe", auth(), controller.wireFrame);
router.post("/inspire", auth(), controller.inspire);
router.delete("/:playbookId/stage/:stageId", auth(), controller.deleteStage);
router.post("/convert/:sitemapId", auth(), controller.convertSitemapToPlaybook);
router.post(
  "/sitemap/:playbookId/stage/:stageId/node/:nodeId/nodedata/:nodeDataId/comment",
  auth(),
  controller.createComment
);
router.patch("/sitemap/simple-update/:id", auth(), controller.simpleUpdate);
router.post("/:playbookId/stage/:stageId/nodes", auth(), controller.addNode);
router.post("/:playbookId/stage/:stageId/nodes/:nodeId/nodeData", auth(), controller.addNodeData);
router.patch(
  "/:playbookId/stage/:stageId/nodes/:nodeId/nodeData/:nodeDataId",
  auth(),
  controller.updateNodeData
);
router.patch("/:playbookId/stage/:stageId/:type/:typeId", auth(), controller.updateType);

router
  .route("/sitemap/:playbookId/stage/:stageId/node/:nodeId/nodedata/:nodeDataId/comment/:commentId")
  .patch(auth(), controller.updateComment)
  .delete(auth(), controller.deleteComment);

router
  .route(
    "/sitemap/:playbookId/stage/:stageId/node/:nodeId/nodedata/:nodeDataId/comment/:commentId/reply"
  )
  .post(auth(), controller.createReply);

router
  .route(
    "/sitemap/:playbookId/stage/:stageId/node/:nodeId/nodedata/:nodeDataId/comment/:commentId/reply/:replyId"
  )
  .patch(auth(), controller.updateReply)
  .delete(auth(), controller.deleteReply);

module.exports = {
  dpbRoutes: router,
};
