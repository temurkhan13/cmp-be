const Joi = require("joi");
const { objectId } = require("../../utils/custom.validation");
// const { objectId } = require('../utils/custom.validation');

const create = {
  body: Joi.object().keys({
    paymentMethodId: Joi.string().required(),
  }),
};

const getCard = {
  params: Joi.object()
    .keys({
      id: Joi.string().custom(objectId).required(),
    })
    .min(1)
    .max(1),
};

const deleteCard = {
  params: Joi.object()
    .keys({
      id: Joi.string().custom(objectId).required(),
    })
    .min(1)
    .max(1),
};

module.exports = {
  create,
  getCard,
  deleteCard,
};
