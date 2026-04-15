const express = require("express");
const helmet = require("helmet");
const xss = require("xss-clean");
// const mongoSanitize = require("express-mongo-sanitize"); // Removed — not needed with PostgreSQL
const compression = require("compression");
const cors = require("cors");
const passport = require("passport");
const httpStatus = require("http-status");
const config = require("../config/config");
const morgan = require("../config/morgan");
const { authLimiter } = require("../middlewares/rateLimiter");
const logRequest = require("../middlewares/logRequest");
const { errorConverter, errorHandler } = require("../middlewares/error");
const { authRoutes } = require("../module/users/route");
const ApiError = require("../utils/ApiError");
const { creditCardRoutes } = require("../module/CreditCards/route");
const { chatRoutes } = require("../module/Chats/route");
const { assessmentRoutes } = require("../module/Assessments/route");
const { dpbRoutes } = require("../module/digitalPlaybook/route");
const { workspaceRoutes } = require("../module/workSpaces/route");
const { stripeRoutes } = require("../module/Subscription/route");
const { feedbackRoutes } = require("../module/Feedback/route");
const { workspaceAssessments } = require("../module/WorkspaceAssessments/route");
const { supportRoutes } = require("../module/Support/route");
require("../config/passport")(passport);

const app = express();


if (config.env !== "test") {
	app.use(morgan.successHandler);
	app.use(morgan.errorHandler);
}

app.use(helmet());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use(xss());
// app.use(mongoSanitize()); // Removed — not needed with PostgreSQL
app.use(compression());
app.use(cors({
	origin: [
		'https://cmp-frontend-gamma.vercel.app',
		'https://cmp-frontend-temurkhan13s-projects.vercel.app',
		'https://cmp-frontend-git-main-temurkhan13s-projects.vercel.app',
		'http://localhost:5173',
		'http://localhost:3000',
	],
	credentials: true,
}));
app.use(passport.initialize());
app.use("/api/auth", authLimiter);
app.use(express.static("public"));
app.use(logRequest);
app.get("/", (req, res) => {
	res.send("OOKKKKKK");
});

app.use("/api/auth", authRoutes);
app.use("/api/card", creditCardRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/assessment", assessmentRoutes);
app.use("/api/survey", assessmentRoutes);
app.use("/api/dpb", dpbRoutes);
app.use("/api/workspace", workspaceRoutes);
app.use("/api/stripe", stripeRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/workspace-assessment", workspaceAssessments);
app.use("/api/support", supportRoutes);

app.use((req, res, next) => {
	next(new ApiError(httpStatus.NOT_FOUND, "API Not found"));
});
app.use(errorConverter);
app.use(errorHandler);

module.exports = app;
