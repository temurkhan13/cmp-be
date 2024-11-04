const { handleStatus } = require("../../common/global.functions.js");
const Subscription = require("../Subscription/entity/model.js");
const config = require("../../config/config.js");
const stripe = require("stripe")(config.stripe.secretKey);
const { getUserById } = require("../users/service.js");
const User = require("../users/entity/model.js");
const logger = require("../../config/logger.js");
const UserSubscription = require("../UserSubscription/entity/model.js");

const getSubscriptions = async (filter, options) => {
	return await Subscription.paginate(filter, options);
};
const createSubscription = async (userId, subscriptionId) => {
	const user = await getUserById(userId);
	if (!user) {
		return handleStatus(false, "User not found");
	}

	const subscription = await Subscription.findById(subscriptionId);
	if (!subscription) {
		return handleStatus(false, "Subscription not found");
	}

	const session = await stripe.checkout.sessions.create({
		payment_method_types: ["card"],
		mode: "subscription",
		line_items: [
			{
				price: subscription.stripePriceId,
				quantity: 1,
			},
		],
		success_url: `${config.frontendUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
		cancel_url: `${config.frontendUrl}/cancel`,
	});

	return {
		status: true,
		redirectToCheckoutURL: session.url,
	};
};
const upgradeSubscription = async (userId, subscriptionId, newPriceId) => {
	const user = await User.findById(userId);
	if (!user || !user.stripeCustomerId) {
		return { status: false, message: "User not found or no active subscription" };
	}

	try {
		const subscription = await stripe.subscriptions.retrieve(subscriptionId);
		const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
			cancel_at_period_end: false,
			proration_behavior: "create_prorations",
			items: [
				{
					id: subscription.items.data[0].id,
					price: newPriceId,
				},
			],
		});

		await updateUserSubscription(updatedSubscription);

		return { status: true, subscription: updatedSubscription };
	} catch (error) {
		logger.error("Error upgrading subscription:", error);
		return { status: false, message: "Failed to upgrade subscription" };
	}
};
const cancelSubscription = async (userId, subscriptionId) => {
	const user = await User.findById(userId);
	if (!user || !user.stripeCustomerId) {
		return { status: false, message: "User not found or no active subscription" };
	}

	try {
		const canceledSubscription = await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
		await updateUserSubscription(canceledSubscription);
		return { status: true };
	} catch (error) {
		logger.error("Error cancelling subscription:", error);
		return { status: false, message: "Failed to cancel subscription" };
	}
};
const getInvoices = async (userId) => {
	const user = await User.findById(userId);
	if (!user || !user.stripeCustomerId) {
		return [];
	}

	try {
		const invoices = await stripe.invoices.list({
			customer: user.stripeCustomerId,
			limit: 10,
		});
		return invoices.data;
	} catch (error) {
		logger.error("Error fetching invoices:", error);
		return [];
	}
};
const resumeSubscription = async (userId, subscriptionId) => {
	const user = await User.findById(userId);
	if (!user || !user.stripeCustomerId) {
		return { status: false, message: "User not found or no active subscription" };
	}

	try {
		const resumedSubscription = await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: false });
		await updateUserSubscription(resumedSubscription);
		return { status: true, subscription: resumedSubscription };
	} catch (error) {
		logger.error("Error resuming subscription:", error);
		return { status: false, message: "Failed to resume subscription" };
	}
};
const webhook = async (body, sig) => {
	let event;
	try {
		event = stripe.webhooks.constructEvent(body, sig, config.stripe.webhookSecret);
	} catch (err) {
		logger.error(`Webhook signature verification failed: ${err.message}`);
		throw new Error(`Webhook Error: ${err.message}`);
	}

	try {
		switch (event.type) {
			case "customer.subscription.created":
			case "customer.subscription.updated":
			case "customer.subscription.deleted":
			case "customer.subscription.trial_will_end":
			case "invoice.payment_succeeded":
			case "invoice.payment_failed":
				await updateUserSubscription(event);
				break;
			default:
				logger.info(`Unhandled event type: ${event.type}`);
		}
	} catch (err) {
		logger.error(`Error processing webhook: ${err.message}`);
		throw new Error("Webhook processing failed");
	}

	return event;
};

const updateUserSubscription = async (event) => {
	const subscription = event.data.object;
	let user = await User.findOne({ email: subscription.customer_email });

	if (!user) {
		logger.error(`User not found for subscription: ${subscription.id}`);
		return;
	}

	let userSubscription = await UserSubscription.findOne({ userId: user._id, stripeSubscriptionId: subscription.id });

	if (!userSubscription) {
		userSubscription = new UserSubscription({
			userId: user._id,
			stripeCustomerId: subscription.customer,
			stripeSubscriptionId: subscription.id,
		});
	}

	switch (event.type) {
		case "customer.subscription.created":
		case "customer.subscription.updated":
		case "customer.subscription.deleted":
			userSubscription.subscriptionStatus = subscription.status;
			userSubscription.currentPeriodEnd = new Date(subscription.current_period_end * 1000);

			if (subscription.items.data.length > 0) {
				const stripePriceId = subscription.items.data[0].price.id;
				const plan = await Subscription.findOne({ stripePriceId: stripePriceId });

				if (plan) {
					userSubscription.subscription = plan._id;
				} else {
					logger.error(`Plan not found for price ID: ${stripePriceId}`);
				}
			}
			break;

		case "invoice.payment_succeeded":
			userSubscription.lastPaymentStatus = "succeeded";
			userSubscription.lastPaymentDate = new Date();
			break;

		case "invoice.payment_failed":
			userSubscription.lastPaymentStatus = "failed";
			userSubscription.lastPaymentDate = new Date();
			break;

		default:
			logger.info(`Unhandled event type: ${event.type}`);
			return;
	}

	await userSubscription.save();

	user.subscription = userSubscription._id;
	await user.save();

	logger.info(`Updated subscription for user: ${user.email}, Event: ${event.type}`);
};

module.exports = {
	getSubscriptions,
	createSubscription,
	upgradeSubscription,
	cancelSubscription,
	getInvoices,
	resumeSubscription,
	webhook,
};
