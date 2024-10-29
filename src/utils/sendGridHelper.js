const sgMail = require('@sendgrid/mail');
const config = require('../config/config');
const logger = require('../config/logger');

// Your SendGrid API Key
sgMail.setApiKey(config.sendGrid.apiKey);

const sendVerificationEmail = async (email, verificationCode) => {
  const msg = {
    to: email,
    from: config.sendGrid.email, // Your SendGrid registered email or verified sender
    subject: 'Your Verification Code',
    text: `Your verification code is: ${verificationCode}`,
    html: `<strong>Your verification code is: ${verificationCode}</strong>`,
  };

  return await sgMail
    .send(msg)
    .then((response) => {
      logger.info(`Notification sent successfully with response: ${response}`);
    })
    .catch((error) => {
      logger.error(`Notification sent unsuccessfully with error: ${error}`);
    });
};

const sendForgotPasswordEmail = async (email, verificationCode) => {
  const msg = {
    to: email,
    from: config.sendGrid.email,
    subject: 'Your Password Reset Verification Code',
    text: `Your verification code for password reset is: ${verificationCode}`,
    html: `<strong>Your verification code for password reset is: ${verificationCode}</strong>`,
  };

  return sgMail.send(msg);
};

module.exports = { sendVerificationEmail, sendForgotPasswordEmail };
