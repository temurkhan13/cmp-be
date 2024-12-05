const mongoose = require("mongoose");
const { toJSON, paginate } = require("../../../utils/plugins");

// Define reply schema
const ReplySchema = new mongoose.Schema(
	{
		userId: { type: mongoose.Types.ObjectId, ref: "User" },
		userName: String,
		text: String,
		timestamp: Date,
	},
	{ timestamps: true },
);
// Define comment schema
const CommentSchema = new mongoose.Schema(
	{
		userId: { type: mongoose.Types.ObjectId, ref: "User" },
		userName: String,
		text: String,
		timestamp: Date,
		status: String,
		replies: [ReplySchema],
	},
	{ timestamps: true },
);
// Define node data schema
const nodeDataSchema = mongoose.Schema({
	heading: { type: String },
	description: { type: String },
	color: { type: String },
	comments: [CommentSchema],
});

// Define nodes schema
const nodesSchema = mongoose.Schema({
	heading: { type: String },
	nodeData: [nodeDataSchema],
});

// Define stage schema
const stageSchema = mongoose.Schema({
	stage: { type: String },
	nodeData: [nodeDataSchema],
	nodes: [nodesSchema],
});

// digitalPlaybook Schema
const digitalPlaybookSchema = mongoose.Schema(
	{
		name: { type: String },
		message: { type: String },
		// description: { type: mongoose.Types.ObjectId, ref: 'User' },
		user: { type: mongoose.Types.ObjectId, ref: "User" },
		stages: [stageSchema],
	},
	{ timestamps: true },
);

// Add plugin that converts mongoose to json
digitalPlaybookSchema.plugin(toJSON);
digitalPlaybookSchema.plugin(paginate);

/**
 * @typedef DigitalPlaybook
 */
const DigitalPlaybook = mongoose.model("DigitalPlaybook", digitalPlaybookSchema);

module.exports = DigitalPlaybook;
