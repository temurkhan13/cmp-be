// models/Workspace.js
const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const { toJSON, paginate } = require("../../../utils/plugins");
const config = require("../../../config/config");

const ReplySchema = new Schema(
	{
		userId: { type: mongoose.Types.ObjectId, ref: "User" },
		userName: String,
		text: String,
		timestamp: Date,
	},
	{ timestamps: true },
);

const CommentSchema = new Schema(
	{
		userId: { type: mongoose.Types.ObjectId, ref: "User" },
		messageId: { type: mongoose.Types.ObjectId, default: null },
		userName: String,
		text: String,
		timestamp: Date,
		status: String,
		replies: [ReplySchema],
	},
	{ timestamps: true },
);

const BookmarkSchema = new Schema(
	{
		userId: { type: mongoose.Types.ObjectId, ref: "User" },
		messageId: { type: mongoose.Types.ObjectId, default: null },
		timestamp: Date,
	},
	{ timestamps: true },
);
const QuestionAnswerSchema = new Schema(
	{
		question: {
			// role: String,
			// userId: { type: mongoose.Types.ObjectId, ref: 'User' },
			content: String,
			timestamp: Date,
		},
		answer: {
			// role: String,
			userId: { type: mongoose.Types.ObjectId, ref: "User" },
			content: String,
			timestamp: Date,
		},
		comments: [CommentSchema],
		bookmarks: [BookmarkSchema],
	},
	{ timestamps: true },
);

const SubReportSchema = new Schema(
	{
		finalSubReport: String,
		finalSubReportURL: String,
		ReportTitle: String,
		questionAnswer: [QuestionAnswerSchema],
	},
	{ timestamps: true },
);

const ReportSchema = new Schema(
	{
		finalReport: String,
		finalReportURL: String,
		ReportTitle: String,
		subReport: [SubReportSchema],
	},
	{ timestamps: true },
);

const SharedUserSchema = new Schema(
	{
		userId: { type: mongoose.Types.ObjectId, ref: "User" },
		role: String,
		addedAt: Date,
	},
	{ timestamps: true },
);

const MediaSchema = new Schema(
	{
		fileName: String,
		url: String,
		timestamp: Date,
	},
	{ timestamps: true },
);

const TaskSchema = new Schema(
	{
		name: String,
		progress: Number,
	},
	{ timestamps: true },
);

const VersionSchema = new Schema(
	{
		date: Date,
		users: [{ name: String }],
	},
	{ timestamps: true },
);

const ImageSchema = new Schema(
	{
		url: String,
	},
	{ timestamps: true },
);

const DocumentSchema = new Schema(
	{
		fileName: String,
		name: String,
		date: Date,
		size: String,
	},
	{ timestamps: true },
);

const LinkSchema = new Schema(
	{
		name: String,
		url: String,
	},
	{ timestamps: true },
);

const ReactionSchema = new Schema({
	user: { type: mongoose.Types.ObjectId, ref: "User" },
	type: {
		type: String,
		enum: ["like", "dislike"],
	},
	createdAt: { type: Date, default: Date.now },
});

const MessageSchema = new Schema(
	{
		text: { type: String },
		sender: { type: mongoose.Types.ObjectId, ref: "User" },
		from: { type: String },
		pdfPath: { type: String, default: null },
		reactions: [ReactionSchema],
		// images: [ImageSchema],
	},
	{
		// toJSON: {
		//   transform(doct, ret) {
		//     if (ret.pdfPath) {
		//       ret.pdfPath = config.rootPath + ret.pdfPath;
		//     }
		//   },
		// },
		timestamps: true,
	},
);

const ChatSchema = new Schema(
	{
		version: Number,
		chatTitle: String,
		generalMessages: [MessageSchema],
		comments: [CommentSchema],
		bookmarks: [BookmarkSchema],
		sharedUsers: [SharedUserSchema],
		media: [MediaSchema],
		documents: [DocumentSchema],
		links: [LinkSchema],
		tasks: [TaskSchema],
		versions: [VersionSchema],
		isSoftDeleted: { type: Boolean, default: false },
	},
	{
		toJSON: {
			transform(doct, ret) {
				if (ret.media) {
					ret.media = ret.media.map((image) => config.rootPath + image.url);
				}
				// delete ret.OTP;
				// delete ret.password;
			},
		},
		timestamps: true,
	},
);

const AssessmentSchema = new Schema(
	{
		name: String,
		version: Number,
		report: [ReportSchema],
		sharedUsers: [SharedUserSchema],
		media: [MediaSchema],
		tasks: [TaskSchema],
		versions: [VersionSchema],
		// images: [ImageSchema],
		documents: [DocumentSchema],
		links: [LinkSchema],
		isSoftDeleted: { type: Boolean, default: false },
	},
	{ timestamps: true },
);

const businessInfoSchema = new Schema({
	companySize: {
		type: Number,
		trim: true,
		default: null,
	},
	companyName: {
		type: String,
		trim: true,
		default: null,
	},
	jobTitle: {
		type: String,
		trim: true,
		default: null,
	},
	industry: {
		type: String,
		trim: true,
		default: null,
	},
	role: {
		type: String,
		default: "user",
	},
	userName: {
		type: String,
		trim: true,
	},
});

const surveyInfoSchema = new Schema({
	question: {
		type: String,
		default: null,
	},
	answer: {
		type: String,
		default: null,
	},
});

const styleSchema = {
	type: Map,
	of: String,
};

const elementSchema = new Schema(
	{
		element: String,
		type: String,
		list: [String],
		text: String,
		style: styleSchema,
	},
	{
		toJSON: {
			transform(doc, ret) {
				ret.id = ret._id;
				delete ret._id;
				delete ret.__v;
			},
		},
	},
);

const shapeSchema = new Schema(
	{
		shape: String,
		style: styleSchema,
	},
	{
		toJSON: {
			transform(doc, ret) {
				ret.id = ret._id;
				delete ret._id;
				delete ret.__v;
			},
		},
	},
);

const datasetsSchema = new Schema(
	{
		label: String,
		data: [Number],
		backgroundColor: [String],
		lineThickness: Number,
	},
	{
		toJSON: {
			transform(doc, ret) {
				ret.id = ret._id;
				delete ret._id;
				delete ret.__v;
			},
		},
	},
);

const entitySchema = new Schema(
	{
		element: String,
		layout: String,
		text: String,
		description: String,
		image: String,
		type: String,
		chartType: String,
		pageIndex: Number,
		layoutIndex: Number,
		styles: styleSchema,
		descriptionStyles: styleSchema,
		elements: [elementSchema],
		shapes: [shapeSchema],
		table: [[String]],
		chartData: {
			labels: [String],
			datasets: [datasetsSchema],
		},
	},
	{
		toJSON: {
			virtuals: true,
			transform(doc, ret) {
				ret.id = ret._id;
				delete ret._id;
				delete ret.__v;
				if (ret.image) {
					const isUrl = /^(http|https):\/\/[^ "]+$/.test(ret.image);
					if (!isUrl) {
						ret.image = `${config.rootPath}${ret.image}`;
					}
				}
				return ret;
			},
		},
	},
);

const wireframeSchema = new Schema(
	{
		sitemapId: {
			type: mongoose.Types.ObjectId,
		},
		title: {
			type: String,
			trim: true,
		},
		comments: [CommentSchema],
		entities: [entitySchema],
	},
	{
		toJSON: {
			transform(doc, ret) {
				if (ret.entities && Array.isArray(ret.entities)) {
					ret.entities.sort((a, b) => {
						if (a.pageIndex !== b.pageIndex) {
							return a.pageIndex - b.pageIndex;
						}
						return a.layoutIndex - b.layoutIndex;
					});
				}

				ret.id = ret._id;
				delete ret._id;
			},
		},
		timestamps: true,
	},
);

const FolderSchema = new Schema(
	{
		folderName: String,
		chats: [ChatSchema],
		assessments: [AssessmentSchema],
		businessInfo: [businessInfoSchema],
		surveyInfo: [surveyInfoSchema],
		sitemaps: [
			{
				type: mongoose.Schema.Types.ObjectId,
				ref: "DigitalPlaybook",
			},
		],
		wireframes: [wireframeSchema],
		isSoftDeleted: { type: Boolean, default: false },
	},
	{ timestamps: true },
);

const WorkspaceSchema = new Schema(
	{
		workspaceName: String,
		workspaceDescription: { type: String, default: null },
		userId: { type: mongoose.Types.ObjectId, ref: "User" },
		folders: [FolderSchema],
		isActive: { type: Boolean, default: false },
		isSoftDeleted: { type: Boolean, default: false },
	},
	{ timestamps: true },
);

WorkspaceSchema.plugin(toJSON);
WorkspaceSchema.plugin(paginate);

WorkspaceSchema.pre("save", async function (next) {
	if (this.isActive) {
		await Workspace.updateMany({ userId: this.userId }, { isActive: false });
	}
	next();
});

const Workspace = mongoose.model("Workspace", WorkspaceSchema);
module.exports = Workspace;
