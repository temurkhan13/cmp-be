const config = require('../config/config');
const nodemailer = require('nodemailer');
const logger = require('../config/logger');

const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: config.nodeMailer.email,
    pass: config.nodeMailer.password,
  },
});

const fromAddress = `"ChangeAI" <${config.nodeMailer.email}>`;

const emailWrapper = (content) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
    <div style="background:#0B1444;padding:24px 32px;text-align:center;">
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:600;">Change<span style="color:#C3E11D;">AI</span></h1>
    </div>
    <div style="padding:32px;">
      ${content}
    </div>
    <div style="padding:16px 32px;background:#f9fafb;text-align:center;font-size:12px;color:#9ca3af;">
      <p style="margin:0;">&copy; ${new Date().getFullYear()} ChangeAI by InnovationWorks. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;

const sendVerificationEmail = async (email, verificationCode) => {
  const html = emailWrapper(`
    <h2 style="margin:0 0 8px;font-size:20px;color:#111;">Verify Your Email</h2>
    <p style="color:#6b7280;font-size:14px;line-height:1.6;">
      Enter the code below in ChangeAI to verify your email address.
    </p>
    <div style="margin:24px 0;text-align:center;">
      <div style="display:inline-block;background:#f4f4f5;border:2px dashed #C3E11D;border-radius:8px;padding:16px 32px;letter-spacing:8px;font-size:28px;font-weight:700;color:#0B1444;">
        ${verificationCode}
      </div>
    </div>
    <p style="color:#9ca3af;font-size:12px;">This code expires in 10 minutes. If you didn't create an account, ignore this email.</p>
  `);

  try {
    await transporter.sendMail({
      from: fromAddress,
      to: email,
      subject: 'Verify your email — ChangeAI',
      text: `Your ChangeAI verification code is: ${verificationCode}`,
      html,
    });
    logger.info(`Verification email sent to ${email}`);
  } catch (error) {
    logger.error(`Failed to send verification email to ${email}: ${error.message}`);
    throw error;
  }
};

const sendForgotPasswordEmail = async (email, verificationCode) => {
  const html = emailWrapper(`
    <h2 style="margin:0 0 8px;font-size:20px;color:#111;">Reset Your Password</h2>
    <p style="color:#6b7280;font-size:14px;line-height:1.6;">
      We received a request to reset your password. Use the code below to proceed.
    </p>
    <div style="margin:24px 0;text-align:center;">
      <div style="display:inline-block;background:#f4f4f5;border:2px dashed #C3E11D;border-radius:8px;padding:16px 32px;letter-spacing:8px;font-size:28px;font-weight:700;color:#0B1444;">
        ${verificationCode}
      </div>
    </div>
    <p style="color:#9ca3af;font-size:12px;">This code expires in 10 minutes. If you didn't request a password reset, ignore this email.</p>
  `);

  try {
    await transporter.sendMail({
      from: fromAddress,
      to: email,
      subject: 'Password Reset Code — ChangeAI',
      text: `Your ChangeAI password reset code is: ${verificationCode}`,
      html,
    });
    logger.info(`Password reset email sent to ${email}`);
  } catch (error) {
    logger.error(`Failed to send password reset email to ${email}: ${error.message}`);
    throw error;
  }
};

const sendInviteEmail = async (email, inviteLink) => {
  const html = emailWrapper(`
    <h2 style="margin:0 0 8px;font-size:20px;color:#111;">You've Been Invited</h2>
    <p style="color:#6b7280;font-size:14px;line-height:1.6;">
      Someone has invited you to collaborate on ChangeAI. Click the button below to join.
    </p>
    <div style="margin:24px 0;text-align:center;">
      <a href="${inviteLink}" style="display:inline-block;background:#C3E11D;color:#0B1444;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
        Accept Invitation
      </a>
    </div>
    <p style="color:#9ca3af;font-size:12px;">If the button doesn't work, copy this link: ${inviteLink}</p>
  `);

  try {
    await transporter.sendMail({
      from: fromAddress,
      to: email,
      subject: 'You\'ve been invited to ChangeAI',
      text: `You've been invited to collaborate on ChangeAI. Click here to join: ${inviteLink}`,
      html,
    });
    logger.info(`Invite email sent to ${email}`);
  } catch (error) {
    logger.error(`Failed to send invite email to ${email}: ${error.message}`);
    throw error;
  }
};

module.exports = {
  sendVerificationEmail,
  sendForgotPasswordEmail,
  sendInviteEmail,
};
