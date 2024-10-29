const dotenv = require("dotenv");
const path = require("path");
const Joi = require("joi");

dotenv.config({ path: path.join(__dirname, "../../.env") });

const envVarsSchema = Joi.object()
	.keys({
		NODE_ENV: Joi.string().valid("production", "development", "test").required(),
		ROOT_PATH: Joi.string(),
		BASE_URL: Joi.string().required().description("Base URL"),
		PORT: Joi.number().default(3000),
		MONGODB_URL: Joi.string().required().description("Mongo DB url"),
		JWT_SECRET: Joi.string().required().description("JWT secret key"),
		JWT_ACCESS_EXPIRATION_MINUTES: Joi.number().default(90).description("minutes after which access tokens expire"),
		JWT_REFRESH_EXPIRATION_DAYS: Joi.number().default(30).description("days after which refresh tokens expire"),
		STRIPE_KEY: Joi.string().required().description("Stripe key is required"),
		STRIPE_SECRET_KEY: Joi.string().required().description("Stripe secret key is required"),
		STRIPE_WEBHOOK_SECRET: Joi.string().required().description("Stripe webhook secret is required"),
		NODE_MAILER_EMAIL: Joi.string().required(),
		NODE_MAILER_PASSWORD: Joi.string().required(),
		SENDGRID_TOKEN: Joi.string().required().description("SendGrid token is required"),
		SENDGRID_EMAIL_FROM: Joi.string().required().description("SendGrid email is required"),
		FRONTEND_URL: Joi.string().required().description("Frontend URL"),
		FRONTEND_LOGIN_URL: Joi.string().required().description("Frontend login URL"),
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
	mongoose: {
		url: envVars.MONGODB_URL + (envVars.NODE_ENV === "test" ? "-test" : ""),
		masterUrl: envVars.MONGODB_URL_MASTER + (envVars.NODE_ENV === "test" ? "-test" : ""),
		options: {
			useCreateIndex: true,
			useNewUrlParser: true,
			useUnifiedTopology: true,
			useFindAndModify: false,
		},
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
	sendGrid: {
		apiKey: envVars.SENDGRID_TOKEN,
		email: envVars.SENDGRID_EMAIL_FROM,
	},
	frontendUrl: envVars.FRONTEND_URL,
	frontendLoginUrl: envVars.FRONTEND_LOGIN_URL,
};
