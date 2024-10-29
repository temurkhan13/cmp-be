const { Strategy: JwtStrategy, ExtractJwt } = require("passport-jwt");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const config = require("./config");
const { tokenTypes } = require("./tokens");
const User = require("../module/users/entity/model");

const jwtOptions = {
	secretOrKey: config.jwt.secret,
	jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
};
const jwtVerify = async (payload, done) => {
	try {
		if (payload.type !== tokenTypes.ACCESS) {
			throw new Error("Invalid token type");
		}
		const user = await User.findById(payload.sub);
		if (user) {
			return done(null, user);
		}
		done(null, false);
	} catch (error) {
		done(error, false);
	}
};
const jwtStrategy = new JwtStrategy(jwtOptions, jwtVerify);

const googleStrategy = new GoogleStrategy(
	{
		clientID: process.env.GOOGLE_CLIENT_ID,
		clientSecret: process.env.GOOGLE_CLIENT_SECRET,
		callbackURL: "/api/auth/google/callback",
	},
	async (accessToken, refreshToken, profile, done) => {
		const newUser = {
			googleId: profile.id,
			firstName: profile.name.givenName,
			lastName: profile.name.familyName,
			photoPath: profile.photos[0].value,
			email: profile.emails[0].value,
		};

		try {
			let user = await User.findOne({ googleId: profile.id });

			if (user) {
				done(null, user);
			} else {
				user = await User.create(newUser);
				done(null, user);
			}
		} catch (err) {
			console.error(err);
			done(err, false);
		}
	},
);

module.exports = (passport) => {
	passport.use("jwt", jwtStrategy);
	passport.use("google", googleStrategy);

	passport.serializeUser((user, done) => {
		done(null, user.id);
	});

	passport.deserializeUser((id, done) => {
		User.findById(id, (err, user) => done(err, user));
	});
};
