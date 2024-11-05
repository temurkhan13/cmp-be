const express = require("express");
const controller = require("./controller");
const auth = require("../../middlewares/auth");
const validate = require("../../middlewares/validate");
const validation = require("./validation");

const router = express.Router();

router
	.route("/")
	.post(auth(), validate(validation.createFeedback), controller.createFeedback)
	.get(auth(), validate(validation.getFeedbacks), controller.getFeedbacks);
router
	.route("/:feedbackId")
	.get(auth(), validate(validation.getFeedback), controller.getFeedback)
	.patch(auth(), validate(validation.updateFeedback), controller.updateFeedback)
	.delete(auth(), validate(validation.deleteFeedback), controller.deleteFeedback);

module.exports = {
	feedbackRoutes: router,
};
