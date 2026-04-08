const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const logger = require("../config/logger");
const supabase = require("../config/supabase");

const getLimitsBasedOnProductName = (productName) => {
	switch (productName) {
		case "Free":
			return { workspaces: 1, projects: 1, sitemaps: 1, wireframes: 1, version_history: 2, word_limit: 10000 };
		case "Starter":
			return { workspaces: 2, projects: 3, sitemaps: 3, wireframes: 3, version_history: 5, word_limit: 30000 };
		case "Pro":
			return { workspaces: 5, projects: 5, sitemaps: 5, wireframes: 5, version_history: 7, word_limit: 50000 };
		default:
			throw new Error(`Unknown product: ${productName}`);
	}
};

async function syncPlansFromStripe() {
	try {
		if (!process.env.STRIPE_SECRET_KEY) {
			logger.warn("Stripe sync skipped: STRIPE_SECRET_KEY not set");
			return;
		}

		const stripePlans = await stripe.prices.list({
			expand: ["data.product"],
		});

		for (let stripePlan of stripePlans.data) {
			const productName = stripePlan.product.name;
			const limits = getLimitsBasedOnProductName(productName);

			const row = {
				stripe_product_id: stripePlan.product.id,
				stripe_price_id: stripePlan.id,
				name: stripePlan.product.name,
				price: stripePlan.unit_amount / 100,
				...limits,
			};

			const { data: existing } = await supabase
				.from("subscriptions")
				.select("id")
				.eq("stripe_price_id", stripePlan.id)
				.single();

			if (existing) {
				await supabase.from("subscriptions").update(row).eq("id", existing.id);
			} else {
				await supabase.from("subscriptions").insert(row);
			}
		}

		logger.info("Stripe plans synced successfully.");
	} catch (error) {
		logger.error(`Error syncing plans from Stripe: ${error}`);
	}
}

module.exports = { syncPlansFromStripe };
