const dotenv = require("dotenv");
const path = require("path");
const Joi = require("joi");

dotenv.config({ path: path.join(__dirname, "../../.env") });

const envVarsSchema = Joi.object()
	.keys({
		NODE_ENV: Joi.string().valid("production", "development", "test").default("production"),
		ROOT_PATH: Joi.string(),
		BASE_URL: Joi.string().default("http://localhost:3000").description("Base URL"),
		PORT: Joi.number().default(3000),
		SUPABASE_URL: Joi.string().required().description("Supabase project URL"),
		SUPABASE_SERVICE_ROLE_KEY: Joi.string().required().description("Supabase service role key"),
		JWT_SECRET: Joi.string().default("change-me-in-production").description("JWT secret key"),
		JWT_ACCESS_EXPIRATION_MINUTES: Joi.number().default(90).description("minutes after which access tokens expire"),
		JWT_REFRESH_EXPIRATION_DAYS: Joi.number().default(30).description("days after which refresh tokens expire"),
		STRIPE_KEY: Joi.string().default("").description("Stripe key"),
		STRIPE_SECRET_KEY: Joi.string().default("").description("Stripe secret key"),
		STRIPE_WEBHOOK_SECRET: Joi.string().default("").description("Stripe webhook secret"),
		NODE_MAILER_EMAIL: Joi.string().default(""),
		NODE_MAILER_PASSWORD: Joi.string().default(""),
		FRONTEND_URL: Joi.string().default("https://cmp-frontend-gamma.vercel.app").description("Frontend URL"),
		FRONTEND_LOGIN_URL: Joi.string().default("https://cmp-frontend-gamma.vercel.app/log-in").description("Frontend login URL"),
	})
	.unknown();

const { value: envVars, error } = envVarsSchema.prefs({ errors: { label: "key" } }).validate(process.env);

if (error) {
	throw new Error(`Config validation error: ${error.message}`);
}

module.exports = {
	env: envVars.NODE_ENV,
	rootPath: envVars.ROOT_PATH,
	port: envVars.PORT,
	supabase: {
		url: envVars.SUPABASE_URL,
		serviceRoleKey: envVars.SUPABASE_SERVICE_ROLE_KEY,
	},
	jwt: {
		secret: envVars.JWT_SECRET,
		accessExpirationMinutes: envVars.JWT_ACCESS_EXPIRATION_MINUTES,
		refreshExpirationDays: envVars.JWT_REFRESH_EXPIRATION_DAYS,
		resetPasswordExpirationMinutes: 10,
	},
	baseUrl: envVars.BASE_URL,
	stripe: {
		key: envVars.STRIPE_KEY,
		secretKey: envVars.STRIPE_SECRET_KEY,
		webhookSecret: envVars.STRIPE_WEBHOOK_SECRET,
	},
	nodeMailer: {
		email: envVars.NODE_MAILER_EMAIL,
		password: envVars.NODE_MAILER_PASSWORD,
		verificationLink: envVars.EMAIL_VERIFICATION_LINK,
	},
	frontendUrl: envVars.FRONTEND_URL,
	frontendLoginUrl: envVars.FRONTEND_LOGIN_URL,
};
