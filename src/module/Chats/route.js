const express = require("express");
const controller = require("./controller");
const validation = require("./validation");
const validate = require("../../middlewares/validate");
const auth = require("../../middlewares/auth");
const { fileUpload } = require("../../utils/fileUpload");
const checkSubscription = require("../../middlewares/checkSubscription");

const router = express.Router();

router.post("/", auth(), fileUpload.single("pdfPath"), controller.create);
router.patch("/:id", auth(), fileUpload.single("pdfPath"), controller.update);
router.get("/:id", auth(), controller.get);
router.post(
	"/change-tone",
	auth(),
	checkSubscription({ checkWordLimit: true, wordCountField: "message" }),
	controller.changeTone,
);
router.patch("/change-tone/:chatId/message/:messageId", auth(), controller.updateChangeTone);
router.post(
	"/translate",
	auth(),
	checkSubscription({ checkWordLimit: true, wordCountField: "message" }),
	controller.translate,
);
router.post(
	"/imporve-writing",
	auth(),
	checkSubscription({ checkWordLimit: true, wordCountField: "message" }),
	controller.improveWriting,
);
router.post(
	"/grammar-fix",
	auth(),
	checkSubscription({ checkWordLimit: true, wordCountField: "message" }),
	controller.fixGrammar,
);
router.post(
	"/short-text",
	auth(),
	checkSubscription({ checkWordLimit: true, wordCountField: "message" }),
	controller.shorterText,
);
router.post(
	"/long-text",
	auth(),
	checkSubscription({ checkWordLimit: true, wordCountField: "message" }),
	controller.longerText,
);
router.post(
	"/language-simplify",
	auth(),
	checkSubscription({ checkWordLimit: true, wordCountField: "message" }),
	controller.languageSimplify,
);
router.post(
	"/summarize",
	auth(),
	checkSubscription({ checkWordLimit: true, wordCountField: "message" }),
	controller.summarize,
);
router.post("/explain", auth(), checkSubscription({ checkWordLimit: true, wordCountField: "message" }), controller.explain);
router.post(
	"/comprehensive",
	auth(),
	checkSubscription({ checkWordLimit: true, wordCountField: "message" }),
	controller.comprehensiveText,
);
router.post("/auto", auth(), checkSubscription({ checkWordLimit: true, wordCountField: "message" }), controller.autoText);
router.post("/inspire-me", auth(), controller.inspireMe);

module.exports = {
	chatRoutes: router,
};
