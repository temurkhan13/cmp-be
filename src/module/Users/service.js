const httpStatus = require("http-status");
const ApiError = require("../../utils/ApiError");
const { tokenTypes } = require("../../config/tokens");
const User = require("./entity/model");
const Token = require("../tokens/entity/model");
const bcrypt = require("bcryptjs");
const {
	// sendVerificationEmail,
	// sendForgotPasswordEmail,
} = require("../../utils/sendGridHelper");
const { sendVerificationEmail, sendForgotPasswordEmail } = require("../../utils/emailService.js");
const Workspace = require("../workSpaces/entity/modal.js");
const UserSubscription = require("../UserSubscription/entity/model.js");
const workspaceService = require("../workSpaces/service.js");

const generateVerificationCode = async () => {
	let code = Math.floor(Math.random() * 1000000).toString(); // Generate a random number and convert to string
	while (code.length < 6) {
		code = "0" + code; // Pad with leading zeros if necessary
	}
	return code;
};
const register = async (body) => {
	if (await User.isEmailTaken(body.email)) {
		throw new ApiError(httpStatus.BAD_REQUEST, "User already exists");
	}
	const user = await User.create(body);
	// Generate a random 6 digit verification code
	const verificationCode = await generateVerificationCode();
	user.verificationCode["key"] = verificationCode;
	await user.save();
	// await sendVerificationEmail(user.email, verificationCode);
	await sendVerificationEmail(user.email, verificationCode);
	return user;
};

const verifyEmail = async (id, verificationCode) => {
	const user = await getUser({ _id: id });
	if (!user) {
		throw new ApiError(httpStatus.BAD_REQUEST, "User not found.");
	}

	if (user.verificationCode["key"] !== verificationCode || user.verificationCode["key"] === null) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Invalid verification Code");
	}

	user.verificationCode["key"] = null;
	user.verificationCode["verify"] = true;
	await workspaceService.createDefaultWorkspace(user._id);
	await user.save();
	return true;
};
/**
 * Login with username and password
 * @param {string} email
 * @param {string} password
 * @returns {Promise<User>}
 */
const loginUserWithEmailAndPassword = async (email, password) => {
	const user = await getUser({ email });
	console.log(user, "user===========");
	if (user && user.suspended) {
		throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, "Your account has been suspended, Please contact adminstration!");
	}
	// if (!user.verificationCode['verify']) {
	//   throw new ApiError(
	//     httpStatus.SERVICE_UNAVAILABLE,
	//     'Your account is not verified! Check you email.'
	//   );
	// }
	if (!user || !(await user.isPasswordMatch(password))) {
		throw new ApiError(httpStatus.UNAUTHORIZED, "Incorrect email or password");
	}
	return user;
};

/**
 *
 * @param {*} filter
 * @returns {Promise<User>}
 */
const getUser = async (filter) => {
	return await User.findOne(filter);
};

const getUserById = async (id) => {
	return await User.findById(id);
};

const forgotPassword = async (email) => {
	const user = await User.findOne({ email });
	if (!user) {
		throw new ApiError(httpStatus.BAD_REQUEST, "No user found");
	}
	const OTP = Math.floor(100000 + Math.random() * 900000);
	user.OTP["key"] = OTP;
	await user.save();
	sendForgotPasswordEmail(email, OTP);
	return OTP;
};
const resetPassword = async (body) => {
	const { email, OTP, newPassword } = body;
	const user = await User.findOne({ email });
	if (!user) {
		throw new ApiError(httpStatus.BAD_REQUEST, "No user found");
	}
	if (user.OTP["key"] !== OTP) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Invalid OTP");
	}
	const hash = await bcrypt.hash(newPassword, 8);
	user.password = hash;
	user.OTP["key"] = null;
	await user.save();
	return true;
};

/**
 * Logout
 * @param {string} refreshToken
 * @returns {Promise}
 */
const logout = async (data) => {
	let refreshToken = data.refreshToken;
	const refreshTokenDoc = await Token.findOne({
		token: refreshToken,
		type: tokenTypes.REFRESH,
		blacklisted: false,
	});
	if (!refreshTokenDoc) {
		await systemConfigService.updateActiveSessionCount(-1);
		throw new ApiError(httpStatus.NOT_FOUND, "Not found");
	}
	await refreshTokenDoc.remove();
};

const changePassword = async (body) => {
	const { email, oldPassword, newPassword } = body;
	const user = await User.findOne({ email: email });
	if (!user) {
		throw new ApiError(httpStatus.UNAUTHORIZED, "User with the email doesn't exists!");
	}
	const check = await user.isPasswordMatch(oldPassword);
	if (!check) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Incorrect Old Password");
	} else {
		user.password = newPassword;
		await user.save();
		const updated = "Password Updated";
		return updated;
	}
};

/**
 *
 * @param {*} id
 * @param {*} body
 * @returns  {Promise<User>}
 */
const updateUser = async (id, body) => {
	const user = await getUserById(id);
	if (!user) {
		throw new ApiError(httpStatus.NOT_FOUND, "User not found");
	}
	Object.assign(user, body);
	return await user.save();
};

/**
 *
 * @param {*} id
 * @returns  {Promise<User>}
 */
const deleteUser = async (id) => {
	const user = await getUser({ id });
	if (!user) {
		throw new ApiError(httpStatus.NOT_FOUND, "User not found");
	}
	await user.remove();
};

const queryUsers = async (filter, options) => {
	return await User.paginate(filter, options);
};

const getUserSubscription = async (userId, subscriptionId) => {
	const userSubscription = await UserSubscription.findById(subscriptionId).populate("subscription");
	if (!userSubscription || userSubscription.subscriptionStatus !== "active") {
		throw new ApiError(httpStatus.FORBIDDEN, "Active subscription required");
	}

	if (!userSubscription.subscription) {
		throw new ApiError(httpStatus.FORBIDDEN, "Subscription not found");
	}

	const subscriptionStats = {};

	const subscription = userSubscription.subscription;
	const workspaces = await Workspace.find({ userId });

	const workspaceCount = workspaces.length;
	subscriptionStats.workspaces = {
		used: workspaceCount,
		total: subscription.workspaces,
	};

	const projectCount = workspaces.reduce((total, workspace) => total + workspace.folders.length, 0);
	subscriptionStats.projects = {
		used: projectCount,
		total: subscription.projects,
	};

	const sitemapCount = workspaces.reduce(
		(total, workspace) => total + workspace.folders.reduce((total, folder) => total + folder.sitemaps.length, 0),
		0,
	);
	subscriptionStats.sitemaps = {
		used: sitemapCount,
		total: subscription.sitemaps,
	};

	const wireframeCount = workspaces.reduce(
		(total, workspace) => total + workspace.folders.reduce((total, folder) => total + folder.wireframes.length, 0),
		0,
	);
	subscriptionStats.wireframes = {
		used: wireframeCount,
		total: subscription.wireframes,
	};

	const versionHistoryCount = workspaces.reduce(
		(total, workspace) => total + workspace.folders.reduce((total, folder) => total + folder.versionHistories?.length, 0),
		0,
	);
	subscriptionStats.versionHistory = {
		used: versionHistoryCount,
		total: subscription.versionHistory,
	};

	subscriptionStats.wordLimit = {
		used: userSubscription.wordsUsed,
		total: subscription.wordLimit,
	};

	return subscriptionStats;
};

const sendVerificationEmailToUser = async (userId) => {
	const user = await getUserById(userId);
	if (!user) {
		throw new ApiError(httpStatus.NOT_FOUND, "User not found");
	}
	const verificationCode = await generateVerificationCode();
	user.verificationCode["key"] = verificationCode;
	await user.save();
	await sendVerificationEmail(user.email, verificationCode);
};

module.exports = {
	loginUserWithEmailAndPassword,
	logout,
	resetPassword,
	changePassword,
	updateUser,
	deleteUser,
	queryUsers,
	register,
	verifyEmail,
	forgotPassword,
	getUserById,
	getUserSubscription,
	generateVerificationCode,
	sendVerificationEmailToUser,
};
