const mongoose = require("mongoose");
const { paginate, toJSON } = require("../../../utils/plugins");

const userSubscriptionSchema = new mongoose.Schema(
	{
		userId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
		},
		subscription: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Subscription",
		},
		subscriptionStatus: {
			type: String,
			enum: ["active", "past_due", "unpaid", "canceled", "incomplete", "incomplete_expired", "trialing"],
			default: "incomplete",
		},
		currentPeriodEnd: Date,
		lastPaymentStatus: String,
		lastPaymentDate: Date,
		stripeSubscriptionId: String,
		stripeCustomerId: String,
		wordsUsed: { type: Number, default: 0 },
	},
	{
		timestamps: true,
	},
);

userSubscriptionSchema.plugin(toJSON);
userSubscriptionSchema.plugin(paginate);

/**
 * @typedef UserSubscription
 */
const UserSubscription = mongoose.model("UserSubscription", userSubscriptionSchema);
module.exports = UserSubscription;
