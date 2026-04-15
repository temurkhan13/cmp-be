const httpStatus = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const userService = require("./service");
const tokenService = require("../tokens/service");
const pick = require("../../utils/pick");
const config = require("../../config/config");
const { getURLParams } = require("../../common/global.functions");
const supabase = require("../../config/supabase");
const ApiError = require("../../utils/ApiError");
const workspaceService = require("../workSpaces/service");

const register = catchAsync(async (req, res) => {
	const user = await userService.register(req.body);
	const tokens = await tokenService.generateAuthTokens(user);
	res.status(httpStatus.CREATED).send({ user, tokens });
});

const login = catchAsync(async (req, res) => {
	const { email, password } = req.body;
	const user = await userService.loginUserWithEmailAndPassword(email, password);
	const tokens = await tokenService.generateAuthTokens(user);
	res.send({ user, tokens });
});

const logout = catchAsync(async (req, res) => {
	await userService.logout(req.body);
	res.status(httpStatus.NO_CONTENT).send();
});

const queryUsers = catchAsync(async (req, res) => {
	const filter = pick(req.query, []);
	const options = pick(req.query, ["page", "limit"]);
	const result = await userService.queryUsers(filter, options);
	res.send(result);
});

const getUser = catchAsync(async (req, res) => {
	const { userId } = req.params;
	const result = await userService.getUserById(userId);
	if (!result) {
		throw new ApiError(httpStatus.NOT_FOUND, "User not found");
	}
	res.send(result);
});

const updateUser = catchAsync(async (req, res) => {
	const { userId } = req.params;
	const { body, file } = req;

	const result = await userService.updateUser(userId, body, file);
	res.send(result);
});

const deleteUser = catchAsync(async (req, res) => {
	const { id } = req.params;
	const result = await userService.deleteUser(id);
	res.send(result);
});
const refreshTokens = catchAsync(async (req, res) => {
	const { refreshToken } = req.body;
	const tokens = await userService.refreshAuth(refreshToken);
	res.send({ ...tokens });
});

/**
 * Forgot Password Module
 */
const forgotPassword = catchAsync(async (req, res) => {
	const { email } = req.body;
	await userService.forgotPassword(email);
	res.send({ success: true, message: 'OTP sent to your email' });
});

const resetPassword = catchAsync(async (req, res) => {
	const { body } = req;
	const user = await userService.resetPassword(body);

	res.send({ success: true });
});
const verifyEmail = catchAsync(async (req, res) => {
	const { user } = req;
	const { verificationCode } = req.body;
	console.log("user,", user, verificationCode);
	const verified = await userService.verifyEmail(user.id, parseInt(verificationCode));

	res.send({ success: true });
});

const verifyGoogleCallback = catchAsync(async (req, res) => {
	const { user } = req;
	await supabase.from("users").update({ verification_code_verify: true }).eq("id", user.id);
	await workspaceService.createDefaultWorkspace(user.id);
	const tokens = await tokenService.generateAuthTokens(req.user);
	const params = getURLParams({
		accessToken: tokens.access.token,
		refreshToken: tokens.refresh.token,
	});
	const clientRedirectRoute = `${config.frontendLoginUrl}?${params.toString()}`;
	res.redirect(clientRedirectRoute);
});

const getUserFromToken = catchAsync(async (req, res) => {
	const { user } = req;
	res.send(user);
});

const getUserSubscriptions = catchAsync(async (req, res) => {
	const { user } = req;
	const { _id: userId, subscription: subscriptionId } = user;
	const subscription = await userService.getUserSubscription(userId, subscriptionId);
	res.send(subscription);
});

const sendVerificationEmailToUser = catchAsync(async (req, res) => {
	const { user } = req;
	const { _id: userId } = user;
	await userService.sendVerificationEmailToUser(userId);
	res.send({ success: true });
});

const changePassword = catchAsync(async (req, res) => {
	const { user } = req;
	const { currentPassword, newPassword } = req.body;
	await userService.changePassword({
		email: user.email,
		oldPassword: currentPassword,
		newPassword,
	});
	res.send({ success: true, message: "Password updated successfully" });
});

const deleteAccount = catchAsync(async (req, res) => {
	const { user } = req;
	await userService.deleteUser(user._id || user.id);
	res.status(httpStatus.OK).send({ success: true, message: "Account deleted successfully" });
});

module.exports = {
	register,
	login,
	logout,
	refreshTokens,
	forgotPassword,
	resetPassword,
	getUser,
	queryUsers,
	updateUser,
	deleteUser,
	verifyEmail,
	verifyGoogleCallback,
	getUserFromToken,
	getUserSubscriptions,
	sendVerificationEmailToUser,
	changePassword,
	deleteAccount,
};
