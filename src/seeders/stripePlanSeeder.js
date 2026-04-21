const logger = require("../config/logger");
const supabase = require("../config/supabase");

const PLANS = [
  {
    stripe_product_id: "prod_UKMdgnPav7SzZd",
    stripe_price_id: "price_1TLhtxFGSdGkq2ukYjOjHaD8",
    name: "Starter",
    price: 0,
    workspaces: 1,
    projects: 1,
    sitemaps: 3,
    wireframes: 1,
    version_history: 2,
    word_limit: 10000,
  },
  {
    stripe_product_id: "prod_UKMdFcJzRGsmAA",
    stripe_price_id: "price_1TLhtyFGSdGkq2uktJBseTRL",
    name: "Professional",
    price: 49,
    workspaces: 5,
    projects: 10,
    sitemaps: 20,
    wireframes: 10,
    version_history: 10,
    word_limit: 100000,
  },
  {
    stripe_product_id: "prod_UKMdX8vC4NiN9S",
    stripe_price_id: "price_1TLhtyFGSdGkq2uk0j4HCUqa",
    name: "Enterprise",
    price: 199,
    workspaces: -1,
    projects: -1,
    sitemaps: -1,
    wireframes: -1,
    version_history: -1,
    word_limit: -1,
  },
];

async function syncPlansFromStripe() {
  try {
    for (const plan of PLANS) {
      const { data: existing } = await supabase
        .from("subscriptions")
        .select("id")
        .eq("stripe_price_id", plan.stripe_price_id)
        .single();

      if (existing) {
        await supabase.from("subscriptions").update(plan).eq("id", existing.id);
        logger.info(`Updated plan: ${plan.name}`);
      } else {
        await supabase.from("subscriptions").insert(plan);
        logger.info(`Created plan: ${plan.name}`);
      }
    }
    logger.info("Stripe plans synced successfully.");
  } catch (error) {
    logger.error(`Error syncing plans: ${error}`);
  }
}

module.exports = { syncPlansFromStripe };
