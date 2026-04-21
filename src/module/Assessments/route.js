const express = require("express");
const controller = require("./controller");
const auth = require("../../middlewares/auth");
const checkSubscription = require("../../middlewares/checkSubscription");

const router = express.Router();

router.post("/", auth(), controller.createAssessment);
router.post("/inspire", auth(), controller.createAssessment);
router.patch("/:id", auth(), controller.updateAssessment);
router.post("/", auth(), controller.createSurvey);
router.patch("/:id", auth(), controller.updateSurvey);
router.get("/:id", auth(), controller.get);
router.post("/", auth(), controller.createCheckChat);
router.patch("/:id", auth(), controller.createCheckChat);

// Version management
router.post(
  "/:id/version",
  auth(),
  checkSubscription({ checkVersionHistory: true }),
  controller.saveVersion
);
router.get("/:id/versions", auth(), controller.getVersions);
router.post("/:id/version/:versionId/restore", auth(), controller.restoreVersion);

module.exports = {
  assessmentRoutes: router,
};
