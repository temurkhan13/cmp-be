const httpStatus = require('http-status');
const ApiError = require('../../utils/ApiError');
const { tokenTypes } = require('../../config/tokens');
const Assessment = require('./entity/modal');
const Token = require('../tokens/entity/model');
const config = require('../../config/config');
const { default: axios } = require('axios');

const createAssessment = async (body) => {
  const { messages, user, generalInfo, bussinessInfo, assessmentName } = body;

  const assessment = await Assessment.create({
    user,
    messages,
    // generalInfo,
    // bussinessInfo,
    // assessmentName,
  });
  console.log('assessment', assessment);

  const chatHistory = await Assessment.findById(assessment._id);

  try {
    const message = messages[0];
    const textMessages = chatHistory.messages
      .filter((msg) => msg.text)
      .map((msg) => msg.text);

    const apiBody = {
      user_id: assessment.user,
      chat_id: assessment._id,
      message: message.text,
      history: textMessages,
      general_info: generalInfo,
      bussiness_info: bussinessInfo,
      assessment_name: assessmentName,
    };

    console.log('body axios', apiBody);
    const gptResponse = await axios.post(
      `${config.baseUrl}/assesment-chat`,
      apiBody
    );
    console.log('gptResponse.data', gptResponse.data);

    const gptMessage = {
      text: gptResponse.data.message,
    };

    const updatedAssessment = await Assessment.findByIdAndUpdate(
      assessment._id,
      { $push: { messages: gptMessage } },
      { new: true }
    );

    return updatedAssessment;
  } catch (error) {
    console.error('Failed to send data to AI server:', error.message);
    throw new Error('AI server error');
  }
};

const createSurvey = async (message, generalInfo, surveyType) => {
  const survey = await Assessment.create(message);
  console.log('survey', survey);
  // Retrieve the full chat document with populated fields if needed
  const chatHistory = await Assessment.findById(survey._id);
  // Assuming you want to send the entire chat history, not just the first text message
  //   const textMessages = chatHistory.messages
  //     .filter((msg) => msg.text)
  //     .map((msg) => msg.text);

  try {
    const body = {
      user_id: survey.user,
      chat_id: survey._id,
      message: body.message,
      history: [],
      general_info: generalInfo,
      survey_type: surveyType,
    };

    console.log('body axios', body);
    const gptResponse = await axios.post(`${config.baseUrl}/survey-chat`, body);
    return gptResponse.data;
  } catch (error) {
    console.error('Failed to send data to AI server:', error.message);
    throw new Error('AI server error'); // Or handle the error in a way that suits your app
  }
};

/**
 *
 * @param {*} id
 * @returns {Promise<About>}
 */
const get = async (id) => {
  const doc = await Assessment.findOne({ _id: id });
  if (!doc) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Assessment not found');
  }
  return doc;
};

const updateAssessment = async (id, updateBody) => {
  const { messages, user, generalInfo, bussinessInfo, assessmentName } =
    updateBody;
  const assessment = await Assessment.findByIdAndUpdate(
    id,
    { $push: { messages }, user }, // Push the new message to the array
    { new: true } // Return the updated document
  );
  console.log('assessment', assessment);

  const message = messages[0];
  const chatHistory = await Assessment.findById(id);
  const textMessages = chatHistory.messages
    .filter((msg) => msg.text)
    .map((msg) => msg.text);

  textMessages.unshift('');
  console.log('textMessages', textMessages);
  try {
    const body = {
      user_id: assessment.user,
      chat_id: assessment._id,
      message: message.text,
      history: textMessages,
      general_info: generalInfo,
      bussiness_info: bussinessInfo,
      assessment_name: assessmentName,
    };

    console.log('body axios', body);
    const gptResponse = await axios.post(
      `${config.baseUrl}/assesment-chat`,
      body
    );

    console.log('gptResponse', gptResponse.data.message);
    // Add GPT response as a new message
    const gptMessage = {
      text: gptResponse.data.message,
      // sender: null, // Indicating that this is a GPT response
      // timestamp: new Date(),
      // generalInfo: null,
      // surType: null,
      // assessmentName: null,
      // checkType: null,
    };

    const updatedAssessment = await Assessment.findByIdAndUpdate(
      id,
      { $push: { messages: gptMessage } },
      { new: true }
    );

    return gptMessage;
    return updatedAssessment;
  } catch (error) {
    console.error('Failed to send data to AI server:', error.message);
    throw new Error('AI server error');
  }
};

const updateSurvey = async (id, message, userId) => {
  const survey = await Assessment.findByIdAndUpdate(
    id,
    { $push: { messages: { ...message, sender: userId } }, user: userId },
    { new: true }
  );
  console.log('survey', survey);

  const chatHistory = await Assessment.findById(id);
  const textMessages = chatHistory.messages
    .filter((msg) => msg.text)
    .map((msg) => msg.text);

  try {
    const body = {
      user_id: survey.user,
      chat_id: survey._id,
      message: message.text,
      history: textMessages,
      general_info: message.generalInfo,
      survey_type: message.surType,
    };

    console.log('body axios', body);
    const gptResponse = await axios.post(
      `${config.baseUrl}/assesment-chat`,
      body
    );

    // Add GPT response as a new message
    const gptMessage = {
      text: gptResponse.data,
      sender: null, // Indicating that this is a GPT response
      timestamp: new Date(),
      generalInfo: null,
      surType: null,
      assessmentName: null,
      checkType: null,
    };

    const updatedSurvey = await Assessment.findByIdAndUpdate(
      id,
      { $push: { messages: gptMessage } },
      { new: true }
    );

    return updatedSurvey;
  } catch (error) {
    console.error('Failed to send data to AI server:', error.message);
    throw new Error('AI server error'); // Or handle the error in a way that suits your app
  }
};

const updateCheckChat = async (id, message, userId) => {
  const survey = await Assessment.findByIdAndUpdate(
    id,
    { $push: { messages: message }, user: userId }, // Push the new message to the array
    { new: true } // Return the updated document
  );
  console.log('survey', survey);
  const chatHistory = await Assessment.findById(id);
  const textMessages = chatHistory.messages
    .filter((msg) => msg.text)
    .map((msg) => msg.text);

  try {
    const body = {
      user_id: survey.user,
      chat_id: survey._id,
      message: message.text,
      history: textMessages,
      general_info: message.generalInfo,
      check_type: message.checkType,
    };

    console.log('body axios', body);
    const gptResponse = await axios.post(
      `${config.baseUrl}/assesment-chat`,
      body
    );
    return gptResponse.data;
  } catch (error) {
    console.error('Failed to send data to AI server:', error.message);
    throw new Error('AI server error'); // Or handle the error in a way that suits your app
  }
};

const createCheckChat = async (message, generalInfo, checkType) => {
  const survey = await Assessment.create(message).populate('user');
  console.log('survey', survey);
  // Retrieve the full chat document with populated fields if needed
  //   const chatHistory = await Assessment.findById(survey._id);
  // Assuming you want to send the entire chat history, not just the first text message
  //   const textMessages = chatHistory.messages
  //     .filter((msg) => msg.text)
  //     .map((msg) => msg.text);

  try {
    const body = {
      user_id: survey.user._id,
      chat_id: survey._id,
      message: body.message,
      history: [],
      general_info: generalInfo,
      check_type: checkType,
      bussiness_info: user,
    };

    console.log('body axios', body);
    const gptResponse = await axios.post(`${config.baseUrl}/check-chat`, body);
    return gptResponse.data;
  } catch (error) {
    console.error('Failed to send data to AI server:', error.message);
    throw new Error('AI server error'); // Or handle the error in a way that suits your app
  }
};

/**
 *
 * @param {*} id
 * @returns {Promise<About>}
 */
const inspireMe = async (message) => {
  try {
    const gptResponse = await axios.post(`${config.baseUrl}/inspire`, message);
    return gptResponse.data;
  } catch (error) {
    console.error('Failed to send data to AI server:', error.message);
    throw new Error('AI server error'); // Or handle the error in a way that suits your app
  }
};

module.exports = {
  createAssessment,
  createSurvey,
  updateAssessment,
  updateSurvey,
  get,
  createCheckChat,
  updateCheckChat,
  inspireMe,
};
