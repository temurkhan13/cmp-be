const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const logger = require("../config/logger");
const Subscription = require("../module/Subscription/entity/model");

const getLimitsBasedOnProductName = (productName) => {
	switch (productName) {
		case "Free":
			return { workspaces: 1, projects: 1, sitemaps: 1, wireframes: 1, versionHistory: 2, wordLimit: 10000 };
		case "Starter":
			return { workspaces: 2, projects: 3, sitemaps: 1, wireframes: 1, versionHistory: 5, wordLimit: 30000 };
		case "Pro":
			return { workspaces: 5, projects: 5, sitemaps: 1, wireframes: 1, versionHistory: 7, wordLimit: 50000 };
		default:
			throw new Error(`Unknown product: ${productName}`);
	}
};

async function syncPlansFromStripe() {
	try {
		const stripePlans = await stripe.prices.list({
			expand: ["data.product"],
		});

		for (let stripePlan of stripePlans.data) {
			const productName = stripePlan.product.name;
			const limits = getLimitsBasedOnProductName(productName);

			await Subscription.findOneAndUpdate(
				{ stripePriceId: stripePlan.id },
				{
					stripeProductId: stripePlan.product.id,
					stripePriceId: stripePlan.id,
					name: stripePlan.product.name,
					price: stripePlan.unit_amount / 100,
					...limits,
				},
				{ upsert: true, new: true },
			);
		}

		logger.info("Stripe plans synced successfully.");
	} catch (error) {
		logger.error(`Error syncing plans from Stripe: ${error}`);
	}
}

module.exports = { syncPlansFromStripe };
