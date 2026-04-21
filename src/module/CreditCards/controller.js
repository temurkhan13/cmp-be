const httpStatus = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const service = require("./service");

const create = catchAsync(async (req, res) => {
  const { user } = req;
  const { paymentMethodId } = req.body;
  const doc = await service.create(paymentMethodId, user);
  res.status(httpStatus.CREATED).send(doc);
});

const getCardLoggedUser = catchAsync(async (req, res) => {
  const { user } = req;
  const doc = await service.getCardLoggedUser(user);
  res.status(httpStatus.OK).json({ doc });
});

const deleteCard = catchAsync(async (req, res) => {
  const { user } = req;
  const doc = await service.deleteCard(user);
  res.status(httpStatus.OK).send(doc);
});

const get = catchAsync(async (req, res) => {
  const { id } = req.params;
  const doc = await service.get(id);
  res.status(httpStatus.OK).send(doc);
});

module.exports = {
  create,
  getCardLoggedUser,
  deleteCard,
  get,
};
