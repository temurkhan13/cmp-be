const httpStatus = require('http-status');
const catchAsync = require('../../utils/catchAsync');
const userService = require('./service');
const tokenService = require('../tokens/service');
const pick = require('../../utils/pick');

const register = catchAsync(async (req, res) => {
  const user = await userService.register(req.body);
  const tokens = await tokenService.generateAuthTokens(user);
  res.status(httpStatus.CREATED).send({ user, tokens });
});

const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  const user = await userService.loginUserWithEmailAndPassword(email, password);
  tokens = await tokenService.generateAuthTokens(user);
  res.send({ user, tokens });
});

const logout = catchAsync(async (req, res) => {
  await userService.logout(req.body);
  res.status(httpStatus.NO_CONTENT).send();
});

const queryUsers = catchAsync(async (req, res) => {
  const filter = pick(req.query, []);
  const options = pick(req.query, ['page', 'limit']);
  const result = await userService.queryUsers(filter, options);
  res.send(result);
});

const getUser = catchAsync(async (req, res) => {
  const { id } = req.params;
  const result = await userService.getUserById(id);
  res.send(result);
});

const updateUser = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { body } = req;
  const result = await userService.updateUser(id, body);
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

const forgotPassword = catchAsync(async (req, res) => {
  const user = await User.find({ email: req.body.email });
  if (user.length === 0) {
    res.json({ msg: 'Invalid Email Address' });
  } else {
    // const resetPasswordToken = await tokenService.generateResetPasswordToken(req.body.email);
    const result = await emailService.sendResetPasswordEmail(req.body.email);
    res.json(result);
  }
});

const resetPassword = catchAsync(async (req, res) => {
  await userService.resetPassword(req.query.token, req.body.password);
  res.status(httpStatus.NO_CONTENT).send();
});

const resetPasswordviaEmail = catchAsync(async (req, res) => {
  const result = await userService.resetPasswordviaEmail(
    req.body.email,
    req.body.newPassword
  );
  res.json(result);
});

// const forcedLogin = catchAsync(async (req, res) => {
//   const io = req.app.get('io');
//   await userService.forcedLogin(req.body, io);
//   res.status(httpStatus.OK).send();
// });
const changePassword = catchAsync(async (req, res) => {
  const result = await userService.changePassword(req.body);
  res.json({ message: result });
});
module.exports = {
  register,
  login,
  logout,
  refreshTokens,
  forgotPassword,
  resetPassword,
  resetPasswordviaEmail,
  changePassword,
  getUser,
  queryUsers,
  updateUser,
  deleteUser,
};
