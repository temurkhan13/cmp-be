const mongoose = require("mongoose");
const { toJSON, paginate } = require("../../../utils/plugins");

const subcategorySchema = new mongoose.Schema({
	_id: false,
	name: {
		type: String,
		required: true,
	},
	selected: {
		type: Boolean,
		default: false,
	},
});

const categorySchema = new mongoose.Schema({
	_id: false,
	name: {
		type: String,
		required: true,
	},
	subcategories: [subcategorySchema],
});

const feedbackSchema = new mongoose.Schema(
	{
		userId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
		},
		rating: {
			type: Number,
			required: true,
			min: 1,
			max: 5,
		},
		category: {
			type: categorySchema,
			required: true,
		},
		feedbackText: {
			type: String,
			required: true,
			trim: true,
		},
	},
	{
		timestamps: true,
	},
);

feedbackSchema.plugin(toJSON);
feedbackSchema.plugin(paginate);

/**
 * @typedef Feedback
 */
const Feedback = mongoose.model("Feedback", feedbackSchema);

module.exports = Feedback;
