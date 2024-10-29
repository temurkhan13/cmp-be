const config = require('../config/config');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: config.nodeMailer.email,
    pass: config.nodeMailer.password,
  },
});

const sendVerificationEmail = async (email, verificationCode) => {
  await transporter.sendMail({
    to: email,
    subject: 'Verify your email',
    text: `Click the following link to verify your email: ${verificationCode}`,
  });
};
const sendForgotPasswordEmail = async (email, verificationCode) => {
  await transporter.sendMail({
    to: email,
    subject: 'Your Password Reset Verification Code',
    text: `Your verification code for password reset is: ${verificationCode}`,
  });
};

const sendInviteEmail = async (email, inviteLink) => {
  // Use your preferred email service to send the email
  await transporter.sendMail({
    to: email,
    subject: 'You have been invited to join a chat',
    text: `Click the following link to join the chat: ${inviteLink}`,
  });
};

module.exports = {
  sendVerificationEmail,
  sendForgotPasswordEmail,
  sendInviteEmail,
};
