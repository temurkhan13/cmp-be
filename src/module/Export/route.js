const express = require("express");
const controller = require("./controller");
const validation = require("./validation");
const validate = require("../../middlewares/validate");
const auth = require("../../middlewares/auth");

const router = express.Router();

router.post("/", auth(), validate(validation.exportDocument), controller.exportDocument);

module.exports = { exportRoutes: router };
