const mongoose = require('mongoose');
const { paginate } = require('../../../utils/plugins');
// const { paginate } = require('../models/plugins');

const creditCardSchema = new mongoose.Schema(
  {
    customer_id: {
      type: String,
      required: true,
    },
    subscription_id: {
      type: String,
      // default: null,
    },
    payment_id: {
      type: String,
    },
    user: {
      type: mongoose.Types.ObjectId,
      ref: 'User',
    },
    last4: {
      type: String,
      required: true,
    },
    exp_month: {
      type: String,
      required: true,
    },
    exp_year: {
      type: String,
      required: true,
    },
    brand: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ['Credit', 'Debit'],
    },
  },
  {
    toJSON: {
      transform(doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret['exp_month'];
        delete ret['exp_year'];
        delete ret['cvc'];
        delete ret.customer_id;
        delete ret.subscription_id;
        delete ret.payment_id;
      },
    },
    timestamps: true,
  }
);
creditCardSchema.plugin(paginate);

creditCardSchema.statics.isCardTaken = async function (number) {
  const card = await this.findOne({ 'card.number': number });
  return !!card;
};

const Card = mongoose.model('Card', creditCardSchema);
module.exports = Card;
