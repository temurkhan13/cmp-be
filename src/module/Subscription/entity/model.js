const mongoose = require("mongoose");
const { paginate, toJSON } = require("../../../utils/plugins");

const subscriptionSchema = new mongoose.Schema(
	{
		stripePriceId: {
			type: String,
			required: true,
			trim: true,
		},
		stripeProductId: {
			type: String,
			required: true,
			trim: true,
		},
		name: {
			type: String,
			required: true,
			trim: true,
		},
		price: {
			type: Number,
			required: true,
		},
		workspaces: {
			type: Number,
			required: true,
		},
		projects: {
			type: Number,
			required: true,
		},
		sitemaps: {
			type: Number,
			required: true,
		},
		wireframes: {
			type: Number,
			required: true,
		},
		versionHistory: {
			type: Number,
			required: true,
		},
		wordLimit: {
			type: Number,
			required: true,
		},
	},
	{
		timestamps: true,
	},
);

subscriptionSchema.plugin(toJSON);
subscriptionSchema.plugin(paginate);

/**
 * @typedef Subscription
 */
const Subscription = mongoose.model("Subscription", subscriptionSchema);
module.exports = Subscription;
