const httpStatus = require('http-status');
const ApiError = require('../../utils/ApiError');
const { tokenTypes } = require('../../config/tokens');
const Chat = require('./entity/model');
const Token = require('../tokens/entity/model');
const { default: axios } = require('axios');
const config = require('../../config/config');
const create = async (body) => {
  const chat = await Chat.create(body);
  if (chat.pdfPath) {
    const body = {
      pdf_file: chat.pdfPath,
      user_id: chat.user,
      chat_id: chat._id,
    };
    const gptResponse = await axios.post(
      `${config.baseUrl}/upload-files`,
      body
    );
    console.log('gptResponse', gptResponse);
  } else {
    const chatHistory = await Chat.findById(chat._id);
    const body = {
      user_id: chat.user,
      chat_id: chat._id,
      message: chat.message,
      history: chatHistory.messages,
    };

    const gptResponse = await axios.post(`${config.baseUrl}/chat`, body);
    console.log('gptResponse', gptResponse);
  }
  return;
};

module.exports = {
  create,
};
