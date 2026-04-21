const httpStatus = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const stripeService = require("./service");
const pick = require("../../utils/pick");

const getSubscriptions = catchAsync(async (req, res) => {
  const filter = pick(req.query, []);
  const options = pick(req.query, ["page", "limit"]);
  options.project = {
    id: 1,
    name: 1,
    price: 1,
    workspaces: 1,
    projects: 1,
    sitemaps: 1,
    wireframes: 1,
    versionHistory: 1,
    wordLimit: 1,
  };
  const result = await stripeService.getSubscriptions(filter, options);
  res.send(result);
});
const createSubscription = catchAsync(async (req, res) => {
  const { subscriptionId } = req.body;
  const { user } = req;
  const { _id: userId } = user;

  const addSubscription = await stripeService.createSubscription(userId, subscriptionId);
  if (!addSubscription.status) {
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).send({ message: addSubscription.message });
  }
  res
    .status(httpStatus.OK)
    .send({ status: true, redirectToCheckoutURL: addSubscription.redirectToCheckoutURL });
});
const upgradeSubscription = catchAsync(async (req, res) => {
  const { subscriptionId } = req.params;
  const { newPriceId } = req.body;
  const { user } = req;

  const result = await stripeService.upgradeSubscription(user.id, subscriptionId, newPriceId);
  if (!result.status) {
    return res.status(httpStatus.BAD_REQUEST).send({ message: result.message });
  }
  res.status(httpStatus.OK).send(result.subscription);
});
const cancelSubscription = catchAsync(async (req, res) => {
  const { subscriptionId } = req.params;
  const { user } = req;

  const result = await stripeService.cancelSubscription(user.id, subscriptionId);
  if (!result.status) {
    return res.status(httpStatus.BAD_REQUEST).send({ message: result.message });
  }
  res.status(httpStatus.OK).send({ message: "Subscription cancelled successfully" });
});
const getInvoices = catchAsync(async (req, res) => {
  const { user } = req;
  const invoices = await stripeService.getInvoices(user.id);
  res.status(httpStatus.OK).send(invoices);
});
const resumeSubscription = catchAsync(async (req, res) => {
  const { user } = req;
  const { subscriptionId } = req.body;
  const result = await stripeService.resumeSubscription(user.id, subscriptionId);
  if (!result.status) {
    return res.status(httpStatus.BAD_REQUEST).send({ message: result.message });
  }
  res.status(httpStatus.OK).send(result.subscription);
});
const webhook = catchAsync(async (req, res) => {
  const sig = req.headers["stripe-signature"];
  try {
    await stripeService.webhook(req.body, sig);
  } catch (error) {
    return res.status(httpStatus.BAD_REQUEST).send({ message: error.message });
  }
  res.json({ received: true });
});

const verifySession = catchAsync(async (req, res) => {
  const { session_id } = req.body;
  const { user } = req;

  if (!session_id) {
    return res.status(httpStatus.BAD_REQUEST).send({ message: "session_id is required" });
  }

  const result = await stripeService.verifySession(user._id, session_id);
  if (!result.status) {
    return res.status(httpStatus.BAD_REQUEST).send({ message: result.message });
  }
  res.status(httpStatus.OK).send({ status: true, message: result.message });
});

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
