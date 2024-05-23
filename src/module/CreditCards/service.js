const ApiError = require('../../utils/ApiError');
const httpStatus = require('http-status');
const config = require('../../config/config');
const Card = require('./entity/model');
const stripe = require('stripe')(config.stripe.key);

const create = async (paymentMethodId, user) => {
  try {
    // Retrieve the payment method details
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

    // Check if the user already has a Stripe customer ID
    let customer;
    if (user.stripeCustomerId) {
      // Retrieve the existing Stripe customer
      customer = await stripe.customers.retrieve(user.stripeCustomerId);
    } else {
      // Create a new Stripe customer
      customer = await stripe.customers.create({
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        payment_method: paymentMethodId,
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });

      // Save the new Stripe customer ID to your database
      user.stripeCustomerId = customer.id;
      await user.save();
    }

    // Attach the PaymentMethod to the customer
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customer.id,
    });

    // Update the default payment method for the customer, in case it is not set
    await stripe.customers.update(customer.id, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    // Save or update the card information in your database
    const card = await Card.findOneAndUpdate(
      { user: user._id },
      {
        customer_id: customer.id,
        payment_id: paymentMethod.id,
        last4: paymentMethod.card.last4,
        exp_month: paymentMethod.card.exp_month,
        exp_year: paymentMethod.card.exp_year,
        brand: paymentMethod.card.brand,
      },
      { new: true, upsert: true }
    );

    return { success: true, message: 'Card added successfully', card: card };
  } catch (error) {
    console.error('Error adding card:', error);
    throw new ApiError(httpStatus.BAD_REQUEST, 'Something went wrong');
  }
};

const get = async (id) => {
  const card = await Card.findById(id);
  if (!card) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Card not found');
  }
  return card;
};

const getCardLoggedUser = async (user) => {
  const card = await Card.findOne({ user: user._id });

  if (!card) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Card not found');
  }
  return card;
};

const deleteCard = async (loggedUser) => {
  const card = await getCardLoggedUser(loggedUser);
  if (!Object.keys(card).length) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Card not found');
  }
  try {
    if (Object.keys(card).length) {
      // @ts-ignore
      await stripe.customers.del(card.customer_id);
      loggedUser.subscription = null;
      await loggedUser.save();
      // @ts-ignore
      await card.remove();
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new BadRequestError(error.message);
    }
    console.log(error);
  }
  return { message: 'Card remove successfully' };
};

module.exports = {
  create,
  get,
  getCardLoggedUser,
  deleteCard,
};
