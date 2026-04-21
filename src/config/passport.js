const { Strategy: JwtStrategy, ExtractJwt } = require("passport-jwt");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const config = require("./config");
const { tokenTypes } = require("./tokens");
const supabase = require("./supabase");
const logger = require("./logger");

const jwtOptions = {
  secretOrKey: config.jwt.secret,
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
};
const jwtVerify = async (payload, done) => {
  try {
    if (payload.type !== tokenTypes.ACCESS) {
      throw new Error("Invalid token type");
    }
    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", payload.sub)
      .single();

    if (error || !user) {
      return done(null, false);
    }
    // Map snake_case to camelCase for frontend compatibility
    user._id = user.id;
    user.firstName = user.first_name;
    user.lastName = user.last_name;
    user.companyName = user.company_name;
    user.photoPath = user.photo_path;
    return done(null, user);
  } catch (error) {
    done(error, false);
  }
};
const jwtStrategy = new JwtStrategy(jwtOptions, jwtVerify);

let googleStrategy = null;
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  googleStrategy = new GoogleStrategy(
    {
      clientID: (process.env.GOOGLE_CLIENT_ID || "").trim(),
      clientSecret: (process.env.GOOGLE_CLIENT_SECRET || "").trim(),
      callbackURL: `${process.env.GOOGLE_CALLBACK_BASE_URL || "https://cmp-backend-830s.onrender.com"}/api/auth/google/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      const newUser = {
        google_id: profile.id,
        first_name: profile.name.givenName,
        last_name: profile.name.familyName,
        photo_path: profile.photos[0].value,
        email: profile.emails[0].value,
      };

      try {
        const { data: existing } = await supabase
          .from("users")
          .select("*")
          .eq("google_id", profile.id)
          .single();

        if (existing) {
          done(null, existing);
        } else {
          const { data: created, error } = await supabase
            .from("users")
            .insert(newUser)
            .select()
            .single();
          if (error) throw error;
          done(null, created);
        }
      } catch (err) {
        logger.error("Google OAuth error:", err);
        done(err, false);
      }
    }
  );
} else {
  logger.warn("Google OAuth disabled: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set");
}

module.exports = (passport) => {
  passport.use("jwt", jwtStrategy);
  if (googleStrategy) {
    passport.use("google", googleStrategy);
  }

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id, done) => {
    try {
      const { data: user, error } = await supabase.from("users").select("*").eq("id", id).single();
      done(error, user);
    } catch (err) {
      done(err, null);
    }
  });
};
