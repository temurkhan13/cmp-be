const httpStatus = require('http-status');
const ApiError = require('../../utils/ApiError');
const { tokenTypes } = require('../../config/tokens');
const User = require('./entity/model');
const Token = require('../tokens/entity/model');
const register = async (body) => {
  if (User.isEmailTaken(body.email)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'User already exists');
  }
  return await User.create(body);
};
/**
 * Login with username and password
 * @param {string} email
 * @param {string} password
 * @returns {Promise<User>}
 */
const loginUserWithEmailAndPassword = async (email, password, forced) => {
  const user = await getUser({ email });
  console.log(user, 'user===========');
  if (user && user.suspended) {
    throw new ApiError(
      httpStatus.SERVICE_UNAVAILABLE,
      'Your account has been suspended, Please contact adminstration!'
    );
  }
  if (!user || !(await user.isPasswordMatch(password))) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Incorrect email or password');
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
    throw new ApiError(httpStatus.NOT_FOUND, 'Not found');
  }
  await refreshTokenDoc.remove();
};

const changePassword = async (body) => {
  const { email, oldPassword, newPassword } = body;
  const user = await User.findOne({ email: email });
  if (!user) {
    throw new ApiError(
      httpStatus.UNAUTHORIZED,
      "User with the email doesn't exists!"
    );
  }
  const check = await user.isPasswordMatch(oldPassword);
  if (!check) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Incorrect Old Password');
  } else {
    user.password = newPassword;
    await user.save();
    const updated = 'Password Updated';
    return updated;
  }
};

/**
 * Reset password
 * @param {string} resetPasswordToken
 * @param {string} newPassword
 * @returns {Promise}
 */
const resetPassword = async (resetPasswordToken, newPassword) => {
  try {
    const resetPasswordTokenDoc = await tokenService.verifyToken(
      resetPasswordToken,
      tokenTypes.RESET_PASSWORD
    );
    const user = await userService.getUserById(resetPasswordTokenDoc.user);
    if (!user) {
      throw new Error();
    }
    await userService.updateUserById(user.id, { password: newPassword });
    await Token.deleteMany({ user: user.id, type: tokenTypes.RESET_PASSWORD });
  } catch (error) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Password reset failed');
  }
};

/**
 * Reset password
 * @param {string} email
 * @param {string} newPassword
 * @param {string} oldPassword
 * @returns {Promise}
 */
const resetPasswordviaEmail = async (email, newPassword) => {
  try {
    const user = await userService.getUserByEmail(email);
    // if (!user || !(await user.isPasswordMatch(oldPassword))) {
    //   throw new Error();
    // }
    await userService.updateUserById(user.id, { password: newPassword });
    const result = 'Password Updated';
    return result;
  } catch (error) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Password reset failed');
  }
};

/**
 * Get Single User
 * @param {string} id
 * @returns {Promise<User>}
 */

const getUserById = async (id) => {
  return await getUser({ id });
};

/**
 *
 * @param {*} id
 * @param {*} body
 * @returns  {Promise<User>}
 */
const updateUser = async (id, body) => {
  const user = await getUser({ id });
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
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
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  await user.remove();
};

const queryUsers = async (filter, options) => {
  return await User.paginate(filter, options);
};
module.exports = {
  loginUserWithEmailAndPassword,
  logout,
  resetPassword,
  resetPasswordviaEmail,
  changePassword,
  getUserById,
  updateUser,
  deleteUser,
  queryUsers,
  register,
};
