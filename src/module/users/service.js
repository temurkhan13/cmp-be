const httpStatus = require("http-status");
const ApiError = require("../../utils/ApiError");
const bcrypt = require("bcryptjs");
const { randomInt } = require("crypto");
const {
  sendVerificationEmail,
  sendForgotPasswordEmail,
  sendWelcomeEmail,
} = require("../../utils/emailService.js");
const supabase = require("../../config/supabase");
const paginate = require("../../utils/paginate");
const workspaceService = require("../workSpaces/service.js");
const logger = require("../../config/logger");

const formatUser = (user) => {
  if (!user) return null;
  const { password: _password, ...rest } = user;
  return {
    ...rest,
    _id: user.id,
    firstName: user.first_name,
    lastName: user.last_name,
    companyName: user.company_name,
    photoPath: user.photo_path,
    googleId: user.google_id,
    verificationCode: {
      key: user.verification_code_key,
      verify: user.verification_code_verify,
      validTill: user.verification_code_valid_till,
    },
    OTP: { key: user.otp_key, validTill: user.otp_valid_till },
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
};

const generateVerificationCode = () => {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
};

const register = async (body) => {
  // Check if email taken
  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .eq("email", body.email)
    .maybeSingle();
  if (existing) {
    throw new ApiError(httpStatus.BAD_REQUEST, "User already exists");
  }

  const hashedPassword = await bcrypt.hash(body.password, 12);
  const verificationCode = generateVerificationCode();

  const { data: user, error } = await supabase
    .from("users")
    .insert({
      first_name: body.firstName,
      last_name: body.lastName,
      email: body.email,
      password: hashedPassword,
      company_name: body.companyName || null,
      verification_code_key: parseInt(verificationCode),
      verification_code_verify: false,
    })
    .select()
    .single();
  if (error) throw new ApiError(httpStatus.BAD_REQUEST, error.message);

  try {
    await sendVerificationEmail(user.email, verificationCode);
  } catch (e) {
    logger.warn("Email send failed (non-blocking):", e.message);
  }
  // Create default workspace on registration
  try {
    await workspaceService.createDefaultWorkspace(user.id);
  } catch (e) {
    logger.error("Default workspace creation failed — compensating by deleting user:", e.message);
    await supabase.from("users").delete().eq("id", user.id);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, "Registration failed, please try again");
  }
  return formatUser(user);
};

const verifyEmail = async (id, verificationCode) => {
  const user = await getUserById(id);
  if (!user) {
    throw new ApiError(httpStatus.BAD_REQUEST, "User not found.");
  }
  if (
    user.verification_code_key !== parseInt(verificationCode) ||
    user.verification_code_key === null
  ) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid verification Code");
  }

  const { error } = await supabase
    .from("users")
    .update({
      verification_code_key: null,
      verification_code_verify: true,
    })
    .eq("id", id);
  if (error) throw error;

  // Only create workspace if user doesn't have one yet
  const { data: existingWs } = await supabase
    .from("workspaces")
    .select("id")
    .eq("user_id", id)
    .limit(1);
  if (!existingWs || existingWs.length === 0) {
    await workspaceService.createDefaultWorkspace(id);
  }

  // Send branded welcome email (non-blocking)
  try {
    await sendWelcomeEmail(user.email, user.first_name);
  } catch (e) {
    logger.warn("Welcome email failed (non-blocking):", e.message);
  }

  return true;
};

const loginUserWithEmailAndPassword = async (email, pwd) => {
  const user = await getUser({ email }, true);
  if (!user || !(await bcrypt.compare(pwd, user.password))) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "Incorrect email or password");
  }
  return formatUser(user);
};

const getUser = async (filter, raw = false) => {
  let query = supabase.from("users").select();
  if (filter.email) query = query.eq("email", filter.email);
  if (filter._id || filter.id) query = query.eq("id", filter._id || filter.id);
  const { data, error } = await query.single();
  if (error) return null;
  return raw ? data : formatUser(data);
};

const getUserById = async (id) => {
  const { data, error } = await supabase.from("users").select().eq("id", id).single();
  if (error) return null;
  return formatUser(data);
};

const forgotPassword = async (email) => {
  const { data: user } = await supabase.from("users").select().eq("email", email).single();
  if (!user) {
    throw new ApiError(httpStatus.BAD_REQUEST, "No user found");
  }
  const OTP = randomInt(100_000, 1_000_000);
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
  const { error } = await supabase
    .from("users")
    .update({ otp_key: OTP, otp_valid_till: otpExpiry })
    .eq("id", user.id);
  if (error) throw error;
  sendForgotPasswordEmail(email, OTP);
  return true;
};

const resetPassword = async (body) => {
  const { email, OTP, newPassword } = body;
  const { data: user } = await supabase.from("users").select().eq("email", email).single();
  if (!user) {
    throw new ApiError(httpStatus.BAD_REQUEST, "No user found");
  }
  if (!user.otp_valid_till || new Date(user.otp_valid_till) < new Date()) {
    throw new ApiError(httpStatus.BAD_REQUEST, "OTP has expired");
  }
  if (user.otp_key !== parseInt(OTP, 10)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid OTP");
  }
  const hashedPassword = await bcrypt.hash(newPassword, 12);
  const { error } = await supabase
    .from("users")
    .update({
      password: hashedPassword,
      otp_key: null,
      otp_valid_till: null,
    })
    .eq("id", user.id);
  if (error) throw error;
  return true;
};

const refreshAuth = async (refreshToken) => {
  const tokenService = require("../tokens/service");
  try {
    const refreshTokenDoc = await tokenService.verifyToken(refreshToken, "refresh");
    const user = await getUserById(refreshTokenDoc.user_id);
    if (!user) {
      throw new ApiError(httpStatus.UNAUTHORIZED, "User not found");
    }
    // Delete old refresh token
    await supabase.from("tokens").delete().eq("id", refreshTokenDoc.id);
    // Generate new token pair
    const tokens = await tokenService.generateAuthTokens({ id: user._id || user.id });
    return tokens;
  } catch {
    throw new ApiError(httpStatus.UNAUTHORIZED, "Invalid refresh token");
  }
};

const logout = async (data) => {
  const { data: tokenDoc } = await supabase
    .from("tokens")
    .select()
    .eq("token", data.refreshToken)
    .eq("type", "refresh")
    .eq("blacklisted", false)
    .single();
  if (!tokenDoc) {
    throw new ApiError(httpStatus.BAD_REQUEST, "No token found!");
  }
  await supabase.from("tokens").delete().eq("id", tokenDoc.id);
};

const changePassword = async (body) => {
  const { email, oldPassword, newPassword } = body;
  const { data: user } = await supabase.from("users").select().eq("email", email).single();
  if (!user) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "User with the email doesn't exists!");
  }
  const check = await bcrypt.compare(oldPassword, user.password);
  if (!check) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Incorrect Old Password");
  }
  const hashedPassword = await bcrypt.hash(newPassword, 12);
  await supabase.from("users").update({ password: hashedPassword }).eq("id", user.id);
  return "Password Updated";
};

const uploadProfilePhoto = async (file) => {
  const fileName = `${Date.now()}-${file.originalname}`;
  const { error } = await supabase.storage.from("avatars").upload(fileName, file.buffer, {
    contentType: file.mimetype,
    upsert: true,
  });
  if (error) throw new ApiError(httpStatus.BAD_REQUEST, `Photo upload failed: ${error.message}`);
  const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(fileName);
  return urlData.publicUrl;
};

const updateUser = async (id, body, file) => {
  const user = await getUserById(id);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }
  const update = {};
  if (body.firstName !== undefined) update.first_name = body.firstName;
  if (body.lastName !== undefined) update.last_name = body.lastName;
  if (body.companyName !== undefined) update.company_name = body.companyName;
  if (file) {
    const publicUrl = await uploadProfilePhoto(file);
    update.photo_path = publicUrl;
  } else if (body.photoPath !== undefined) {
    update.photo_path = body.photoPath;
  }
  if (body.email !== undefined) update.email = body.email;

  const { data, error } = await supabase
    .from("users")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return formatUser(data);
};

const deleteUser = async (id) => {
  const user = await getUserById(id);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }
  await supabase.from("users").delete().eq("id", id);
};

const queryUsers = async (filter, options) => {
  const mapped = {};
  if (filter.email) mapped.email = filter.email;
  return paginate("users", { filter: mapped, ...options }, supabase);
};

const getUserSubscription = async (userId, subscriptionId) => {
  // Get user subscription with plan details
  const { data: userSub } = await supabase
    .from("user_subscriptions")
    .select("*, subscription:subscriptions(*)")
    .eq("id", subscriptionId)
    .single();

  if (!userSub || userSub.subscription_status !== "active") {
    throw new ApiError(httpStatus.FORBIDDEN, "Active subscription required");
  }
  if (!userSub.subscription) {
    throw new ApiError(httpStatus.FORBIDDEN, "Subscription not found");
  }

  const sub = userSub.subscription;

  // Count workspaces
  const { count: workspaceCount } = await supabase
    .from("workspaces")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  // Count folders
  const { data: workspaces } = await supabase.from("workspaces").select("id").eq("user_id", userId);
  const wsIds = (workspaces || []).map((w) => w.id);

  let folderCount = 0,
    sitemapCount = 0,
    wireframeCount = 0;
  if (wsIds.length > 0) {
    const { count: fc } = await supabase
      .from("folders")
      .select("*", { count: "exact", head: true })
      .in("workspace_id", wsIds);
    folderCount = fc || 0;

    const { data: folders } = await supabase.from("folders").select("id").in("workspace_id", wsIds);
    const fIds = (folders || []).map((f) => f.id);
    if (fIds.length > 0) {
      const { count: sc } = await supabase
        .from("folder_sitemap_references")
        .select("*", { count: "exact", head: true })
        .in("folder_id", fIds);
      sitemapCount = sc || 0;
      const { count: wc } = await supabase
        .from("folder_wireframes")
        .select("*", { count: "exact", head: true })
        .in("folder_id", fIds);
      wireframeCount = wc || 0;
    }
  }

  return {
    name: sub.name,
    workspaces: { used: workspaceCount || 0, total: sub.workspaces },
    projects: { used: folderCount, total: sub.projects },
    sitemaps: { used: sitemapCount, total: sub.sitemaps },
    wireframes: { used: wireframeCount, total: sub.wireframes },
    versionHistory: { used: 0, total: sub.version_history },
    wordLimit: { used: userSub.words_used || 0, total: sub.word_limit },
  };
};

const sendVerificationEmailToUser = async (userId) => {
  const user = await getUserById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }
  const verificationCode = generateVerificationCode();
  await supabase
    .from("users")
    .update({ verification_code_key: parseInt(verificationCode) })
    .eq("id", userId);
  await sendVerificationEmail(user.email, verificationCode);
};

module.exports = {
  loginUserWithEmailAndPassword,
  logout,
  refreshAuth,
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
