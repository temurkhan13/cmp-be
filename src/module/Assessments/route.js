const express = require("express");
const controller = require("./controller");
const auth = require("../../middlewares/auth");

const router = express.Router();

router.post("/", auth(), controller.createAssessment);
router.post("/inspire", auth(), controller.createAssessment);
router.patch("/:id", auth(), controller.updateAssessment);
router.post("/", auth(), controller.createSurvey);
router.patch("/:id", auth(), controller.updateSurvey);
router.get("/:id", auth(), controller.get);
router.post("/", auth(), controller.createCheckChat);
router.patch("/:id", auth(), controller.createCheckChat);
module.exports = {
	assessmentRoutes: router,
};
