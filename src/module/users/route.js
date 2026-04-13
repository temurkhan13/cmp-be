const express = require("express");
const passport = require("passport");
const controller = require("./controller");
const validation = require("./validation");
const validate = require("../../middlewares/validate");
const auth = require("../../middlewares/auth");
const { fileUpload } = require("../../utils/fileUpload");

const router = express.Router();

router
	.route("/")
	.post(validate(validation.register), controller.register)
	.get(validate(validation.queryUsers), controller.queryUsers);

router.route("/verification").post(auth(), controller.verifyEmail);
router.post("/forgot/password", validate(validation.forgotPassword), controller.forgotPassword);
router.post("/reset/password", validate(validation.resetPassword), controller.resetPassword);
router.route("/login").post(validate(validation.login), controller.login);
router.route("/logout").post(validate(validation.logout), controller.logout);
router.route("/refresh-tokens").post(controller.refreshTokens);
router.route("/email/send-verification").post(auth(), controller.sendVerificationEmailToUser);

router
	.route("/users/:userId")
	.get(auth(), validate(validation.getUser), controller.getUser)
	.patch(auth(), [fileUpload.single("photoPath"), validate(validation.updateUser)], controller.updateUser);

router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));
router.get(
	"/google/callback",
	passport.authenticate("google", { failureRedirect: "/login", session: false }),
	controller.verifyGoogleCallback,
);
router.post("/get-user-from-token", auth(), controller.getUserFromToken);
router.get("/user-subscription", auth(), controller.getUserSubscriptions);

module.exports = {
	authRoutes: router,
};
