const ApiError = require("../../utils/ApiError");
const httpStatus = require("http-status");
const config = require("../../config/config");
const supabase = require("../../config/supabase");
const stripe = config.stripe.key ? require("stripe")(config.stripe.key) : null;

const create = async (paymentMethodId, user) => {
	try {
		if (!stripe) throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, "Stripe not configured");

		const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

		let customer;
		// Check for existing stripe customer
		const { data: existingCard } = await supabase.from("credit_cards").select("customer_id").eq("user_id", user.id).single();

		if (existingCard && existingCard.customer_id) {
			customer = await stripe.customers.retrieve(existingCard.customer_id);
		} else {
			customer = await stripe.customers.create({
				name: `${user.first_name} ${user.last_name}`,
				email: user.email,
				payment_method: paymentMethodId,
				invoice_settings: { default_payment_method: paymentMethodId },
			});
		}

		await stripe.paymentMethods.attach(paymentMethodId, { customer: customer.id });
		await stripe.customers.update(customer.id, {
			invoice_settings: { default_payment_method: paymentMethodId },
		});

		// Upsert card
		const { data: card, error } = await supabase.from("credit_cards").upsert({
			user_id: user.id,
			customer_id: customer.id,
			payment_id: paymentMethod.id,
			last4: paymentMethod.card.last4,
			exp_month: paymentMethod.card.exp_month,
			exp_year: paymentMethod.card.exp_year,
			brand: paymentMethod.card.brand,
		}, { onConflict: "user_id" }).select().single();
		if (error) throw error;

		return { success: true, message: "Card added successfully", card };
	} catch (error) {
		console.error("Error adding card:", error);
		throw new ApiError(httpStatus.BAD_REQUEST, "Something went wrong");
	}
};

const get = async (id) => {
	const { data: card } = await supabase.from("credit_cards").select().eq("id", id).single();
	if (!card) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Card not found");
	}
	return card;
};

const getCardLoggedUser = async (user) => {
	const { data: card } = await supabase.from("credit_cards").select().eq("user_id", user.id).single();
	if (!card) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Card not found");
	}
	return card;
};

const deleteCard = async (loggedUser) => {
	const card = await getCardLoggedUser(loggedUser);
	try {
		if (stripe) {
			await stripe.customers.del(card.customer_id);
		}
		await supabase.from("users").update({ subscription: null }).eq("id", loggedUser.id);
		await supabase.from("credit_cards").delete().eq("id", card.id);
	} catch (error) {
		console.error(error);
	}
	return { message: "Card remove successfully" };
};

module.exports = {
	create,
	get,
	getCardLoggedUser,
	deleteCard,
};
