const jwt = require("jsonwebtoken");
const moment = require("moment");
const config = require("../../config/config");
const supabase = require("../../config/supabase");
const { tokenTypes } = require("../../config/tokens");
const { v4: uuidv4 } = require("uuid");

const generateToken = (userId, expires, type, secret = config.jwt.secret) => {
  const payload = {
    sub: userId,
    iat: moment().unix(),
    exp: expires.unix(),
    type,
  };
  return jwt.sign(payload, secret);
};

const saveToken = async (token, userId, expires, type, email) => {
  const uid = uuidv4();
  const { data, error } = await supabase
    .from("tokens")
    .insert({
      token,
      user_id: userId,
      expires: expires.toDate(),
      type,
      uid,
      email,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
};

const checkForces = async (id) => {
  const { data, error } = await supabase.from("tokens").select().eq("uid", id.ud);
  if (error) throw error;
  return data || [];
};

const verifyToken = async (token, type) => {
  const payload = jwt.verify(token, config.jwt.secret);
  const { data, error } = await supabase
    .from("tokens")
    .select()
    .eq("token", token)
    .eq("type", type)
    .eq("user_id", payload.sub)
    .eq("blacklisted", false)
    .single();
  if (error || !data) {
    throw new Error("Token not found");
  }
  return data;
};

const generateAuthTokens = async (user, forced) => {
  let accessTokenExpires;
  let refreshTokenExpires;
  if (forced === "APP") {
    accessTokenExpires = moment().add(1, "years");
    refreshTokenExpires = moment().add(1, "years");
  } else {
    accessTokenExpires = moment().add(config.jwt.accessExpirationMinutes, "minutes");
    refreshTokenExpires = moment().add(config.jwt.refreshExpirationDays, "days");
  }
  const accessToken = generateToken(user.id, accessTokenExpires, tokenTypes.ACCESS);
  const refreshToken = generateToken(user.id, refreshTokenExpires, tokenTypes.REFRESH);
  const new_token = await saveToken(
    refreshToken,
    user.id,
    refreshTokenExpires,
    tokenTypes.REFRESH,
    user.email
  );
  return {
    access: {
      token: accessToken,
      expires: accessTokenExpires,
      uuid: new_token.uid,
    },
    refresh: {
      token: refreshToken,
      expires: refreshTokenExpires,
      uuid: new_token.uid,
    },
  };
};

module.exports = {
  generateToken,
  saveToken,
  verifyToken,
  generateAuthTokens,
  checkForces,
};
