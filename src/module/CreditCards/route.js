const express = require('express');
const controller = require('./controller');
const validation = require('./validation');
const validate = require('../../middlewares/validate');
const auth = require('../../middlewares/auth');

const router = express.Router();

router.post('/', auth(), validate(validation.create), controller.create);

router.get('/:id', auth(), validate(validation.getCard), controller.get);

router
  .route('/logged/user')
  .get(auth(), controller.getCardLoggedUser)
  .delete(auth(), controller.deleteCard);
module.exports = {
  creditCardRoutes: router,
};
