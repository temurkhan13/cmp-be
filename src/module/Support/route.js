const express = require("express");
const controller = require("./controller");
const auth = require("../../middlewares/auth");

const router = express.Router();

router.post("/chat", auth(), controller.supportChat);

module.exports = { supportRoutes: router };
