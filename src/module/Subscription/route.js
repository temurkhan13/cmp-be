const express = require("express");
const controller = require("./controller");
const validation = require("./validation");
const validate = require("../../middlewares/validate");
const auth = require("../../middlewares/auth");

const router = express.Router();

router
	.route("/subscription")
	.get(auth(), validate(validation.getSubscriptions), controller.getSubscriptions)
	.post(auth(), validate(validation.createSubscription), controller.createSubscription);
router
	.route("/subscription/:subscriptionId")
	.patch(auth(), validate(validation.upgradeSubscription), controller.upgradeSubscription)
	.delete(auth(), validate(validation.cancelSubscription), controller.cancelSubscription);
router.get("/subscription/invoices", auth(), controller.getInvoices);
router.post("/subscription/resume", auth(), controller.resumeSubscription);
router.post("/webhook/endpoint", controller.webhook);

module.exports = {
	stripeRoutes: router,
};
