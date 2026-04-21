const httpStatus = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const service = require("./service");
const pick = require("../../utils/pick");
const { default: axios } = require("axios");
const config = require("../../config/config");

const create = catchAsync(async (req, res) => {
  const { user, body } = req;
  if (req.file) {
    body.messages = [{ pdfPath: req.file.filename, sender: user._id }];
  }
  if (body.message) {
    body.messages = [{ text: body.message, sender: user._id }];
  }
  body.user = user._id;
  const chat = await service.create(body);
  res.status(httpStatus.OK).send(chat);
});
const update = catchAsync(async (req, res) => {
  const { user, body } = req;
  const { id } = req.params;
  let message = {};
  if (req.file) {
    message = { pdfPath: req.file.filename, sender: user._id };
  }
  if (body.message) {
    message = { text: body.message, sender: user._id };
  }
  const chat = await service.update(id, message, user._id);
  res.status(httpStatus.OK).send(chat);
});

const query = catchAsync(async (req, res) => {
  const filter = pick(req.query, ["user"]);
  const options = pick(req.query, ["sortBy", "limit", "page"]);
  const result = await service.query(filter, options);
  res.send(result);
});
const get = catchAsync(async (req, res) => {
  const { id } = req.params;
  const doc = await service.get(id);
  res.status(httpStatus.OK).send(doc);
});

const changeTone = catchAsync(async (req, res) => {
  const { body } = req;
  const changeTone = await service.changeTone(body);
  res.status(httpStatus.OK).send(changeTone);
});

const updateChangeTone = catchAsync(async (req, res) => {
  const { params, body } = req;
  const { chatId, messageId } = params;
  const changeTone = await service.updateChangeTone(chatId, messageId, body);
  res.status(httpStatus.OK).send(changeTone);
});

const translate = catchAsync(async (req, res) => {
  const { body } = req;
  const translate = await service.translate(body);
  res.status(httpStatus.OK).send(translate);
});
const improveWriting = catchAsync(async (req, res) => {
  const { body } = req;
  const text = await service.improveWriting(body);
  res.status(httpStatus.OK).send(text);
});
const fixGrammar = catchAsync(async (req, res) => {
  const { body } = req;
  const text = await service.fixGrammar(body);
  res.status(httpStatus.OK).send(text);
});
const shorterText = catchAsync(async (req, res) => {
  const { body } = req;
  const text = await service.shorterText(body);
  res.status(httpStatus.OK).send(text);
});
const longerText = catchAsync(async (req, res) => {
  const { body } = req;
  const text = await service.longerText(body);
  res.status(httpStatus.OK).send(text);
});
const languageSimplify = catchAsync(async (req, res) => {
  const { body } = req;
  const text = await service.languageSimplify(body);
  res.status(httpStatus.OK).send(text);
});
const summarize = catchAsync(async (req, res) => {
  const { body } = req;
  const text = await service.summarize(body);
  res.status(httpStatus.OK).send(text);
});
const explain = catchAsync(async (req, res) => {
  const { body } = req;
  const text = await service.explain(body);
  res.status(httpStatus.OK).send(text);
});
const comprehensiveText = catchAsync(async (req, res) => {
  const { body } = req;
  const text = await service.comprehensiveText(body);
  res.status(httpStatus.OK).send(text);
});
const autoText = catchAsync(async (req, res) => {
  const { body } = req;
  const text = await service.autoText(body);
  res.status(httpStatus.OK).send(text);
});
const inspireMe = catchAsync(async (req, res) => {
  const { body } = req;

  const text = await service.inspireMe(body);
  res.status(httpStatus.OK).send(text);
});

const ingest = catchAsync(async (req, res) => {
  const { body, user } = req;
  body.user_id = user._id;
  const result = await axios.post(`${config.baseUrl}/ingest`, body);
  res.status(httpStatus.OK).send(result.data);
});

const search = catchAsync(async (req, res) => {
  const { body, user } = req;
  body.user_id = user._id;
  const result = await axios.post(`${config.baseUrl}/search`, body);
  res.status(httpStatus.OK).send(result.data);
});

module.exports = {
  create,
  update,
  get,
  query,
  changeTone,
  updateChangeTone,
  translate,
  improveWriting,
  fixGrammar,
  shorterText,
  longerText,
  languageSimplify,
  summarize,
  explain,
  comprehensiveText,
  autoText,
  inspireMe,
  ingest,
  search,
};
