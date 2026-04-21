const config = require("../../config/config.js");
const stripe = config.stripe.secretKey ? require("stripe")(config.stripe.secretKey) : null;
const logger = require("../../config/logger.js");
const supabase = require("../../config/supabase");
const paginate = require("../../utils/paginate");

const getSubscriptions = async (filter, options) => {
  return paginate("subscriptions", { filter, ...options }, supabase);
};

const createSubscription = async (userId, subscriptionId) => {
  const { data: user } = await supabase.from("users").select().eq("id", userId).single();
  if (!user) return { status: false, message: "User not found" };

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select()
    .eq("id", subscriptionId)
    .single();
  if (!subscription) return { status: false, message: "Subscription not found" };

  if (!stripe) return { status: false, message: "Stripe not configured" };

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "subscription",
    customer_email: user.email,
    line_items: [{ price: subscription.stripe_price_id, quantity: 1 }],
    success_url: `${config.frontendUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.frontendUrl}/dashboard/PlanBilling`,
  });

  return { status: true, redirectToCheckoutURL: session.url };
};

const upgradeSubscription = async (userId, subscriptionId, newPriceId) => {
  const { data: user } = await supabase
    .from("users")
    .select("*, credit_card:credit_cards(customer_id)")
    .eq("id", userId)
    .single();
  if (!user || !stripe)
    return { status: false, message: "User not found or no active subscription" };

  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
      proration_behavior: "create_prorations",
      items: [{ id: subscription.items.data[0].id, price: newPriceId }],
    });
    await handleSubscriptionEvent({
      type: "customer.subscription.updated",
      data: { object: updatedSubscription },
    });
    return { status: true, subscription: updatedSubscription };
  } catch (error) {
    logger.error("Error upgrading subscription:", error);
    return { status: false, message: "Failed to upgrade subscription" };
  }
};

const cancelSubscription = async (userId, subscriptionId) => {
  const { data: user } = await supabase.from("users").select().eq("id", userId).single();
  if (!user || !stripe)
    return { status: false, message: "User not found or no active subscription" };

  try {
    const canceledSubscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });
    await handleSubscriptionEvent({
      type: "customer.subscription.updated",
      data: { object: canceledSubscription },
    });
    return { status: true };
  } catch (error) {
    logger.error("Error cancelling subscription:", error);
    return { status: false, message: "Failed to cancel subscription" };
  }
};

const getInvoices = async (userId) => {
  const { data: card } = await supabase
    .from("credit_cards")
    .select("customer_id")
    .eq("user_id", userId)
    .single();
  if (!card || !stripe) return [];

  try {
    const invoices = await stripe.invoices.list({ customer: card.customer_id, limit: 10 });
    return invoices.data;
  } catch (error) {
    logger.error("Error fetching invoices:", error);
    return [];
  }
};

const resumeSubscription = async (userId, subscriptionId) => {
  const { data: user } = await supabase.from("users").select().eq("id", userId).single();
  if (!user || !stripe)
    return { status: false, message: "User not found or no active subscription" };

  try {
    const resumedSubscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
    });
    await handleSubscriptionEvent({
      type: "customer.subscription.updated",
      data: { object: resumedSubscription },
    });
    return { status: true, subscription: resumedSubscription };
  } catch (error) {
    logger.error("Error resuming subscription:", error);
    return { status: false, message: "Failed to resume subscription" };
  }
};

const webhook = async (body, sig) => {
  if (!stripe) throw new Error("Stripe not configured");
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
        await handleSubscriptionEvent(event);
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

const handleSubscriptionEvent = async (event) => {
  const subscription = event.data.object;

  // Primary lookup: credit_cards.customer_id (always present in Stripe events)
  let user = null;
  if (subscription.customer) {
    const { data: card } = await supabase
      .from("credit_cards")
      .select("user_id, users(*)")
      .eq("customer_id", subscription.customer)
      .single();
    if (card?.users) user = card.users;
  }

  // Fallback: customer_email (present when called from verifySession)
  if (!user && subscription.customer_email) {
    const { data: found } = await supabase
      .from("users")
      .select()
      .eq("email", subscription.customer_email)
      .single();
    user = found || null;
  }

  if (!user) {
    logger.error(`User not found for subscription ${subscription.id} (customer: ${subscription.customer})`);
    return;
  }

  // Find or create user subscription
  let { data: userSub } = await supabase
    .from("user_subscriptions")
    .select()
    .eq("user_id", user.id)
    .eq("stripe_subscription_id", subscription.id)
    .single();

  const subData = {
    user_id: user.id,
    stripe_customer_id: subscription.customer,
    stripe_subscription_id: subscription.id,
  };

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      subData.subscription_status = subscription.status;
      subData.current_period_end = new Date(subscription.current_period_end * 1000);
      if (subscription.items && subscription.items.data.length > 0) {
        const stripePriceId = subscription.items.data[0].price.id;
        const { data: plan } = await supabase
          .from("subscriptions")
          .select("id")
          .eq("stripe_price_id", stripePriceId)
          .single();
        if (plan) subData.subscription_id = plan.id;
      }
      break;
    case "invoice.payment_succeeded":
      subData.last_payment_status = "succeeded";
      subData.last_payment_date = new Date();
      break;
    case "invoice.payment_failed":
      subData.last_payment_status = "failed";
      subData.last_payment_date = new Date();
      break;
  }

  let savedSub;
  if (userSub) {
    const { data } = await supabase
      .from("user_subscriptions")
      .update(subData)
      .eq("id", userSub.id)
      .select()
      .single();
    savedSub = data;
  } else {
    const { data } = await supabase.from("user_subscriptions").insert(subData).select().single();
    savedSub = data;
  }

  if (savedSub) {
    await supabase.from("users").update({ subscription: savedSub.id }).eq("id", user.id);
  }

  logger.info(`Updated subscription for user: ${user.email}, Event: ${event.type}`);
};

const verifySession = async (userId, sessionId) => {
  if (!stripe) return { status: false, message: "Stripe not configured" };

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });

    if (session.payment_status !== "paid") {
      return { status: false, message: "Payment not completed" };
    }

    const subscription = session.subscription;
    if (subscription) {
      // Attach customer_email so handleSubscriptionEvent can find the user
      if (!subscription.customer_email) {
        subscription.customer_email = session.customer_details?.email || session.customer_email;
      }
      // If still no email, look up the user directly
      if (!subscription.customer_email) {
        const { data: user } = await supabase
          .from("users")
          .select("email")
          .eq("id", userId)
          .single();
        if (user) subscription.customer_email = user.email;
      }

      await handleSubscriptionEvent({
        type: "customer.subscription.created",
        data: { object: subscription },
      });
    }

    return { status: true, message: "Subscription activated" };
  } catch (error) {
    logger.error("Error verifying checkout session:", error);
    return { status: false, message: "Failed to verify payment session" };
  }
};

module.exports = {
  getSubscriptions,
  createSubscription,
  upgradeSubscription,
  cancelSubscription,
  getInvoices,
  resumeSubscription,
  webhook,
  verifySession,
};
