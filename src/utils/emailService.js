const { Resend } = require('resend');
const config = require('../config/config');
const logger = require('../config/logger');

const resend = new Resend(config.resendApiKey);

const fromAddress = 'ChangeAI <onboarding@resend.dev>';

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
    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: email,
      subject: 'Verify your email — ChangeAI',
      text: `Your ChangeAI verification code is: ${verificationCode}`,
      html,
    });
    if (error) throw new Error(error.message);
    logger.info(`Verification email sent to ${email} (id: ${data.id})`);
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
    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: email,
      subject: 'Password Reset Code — ChangeAI',
      text: `Your ChangeAI password reset code is: ${verificationCode}`,
      html,
    });
    if (error) throw new Error(error.message);
    logger.info(`Password reset email sent to ${email} (id: ${data.id})`);
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
    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: email,
      subject: "You've been invited to ChangeAI",
      text: `You've been invited to collaborate on ChangeAI. Click here to join: ${inviteLink}`,
      html,
    });
    if (error) throw new Error(error.message);
    logger.info(`Invite email sent to ${email} (id: ${data.id})`);
  } catch (error) {
    logger.error(`Failed to send invite email to ${email}: ${error.message}`);
    throw error;
  }
};

const sendWelcomeEmail = async (email, firstName) => {
  const name = firstName || 'there';
  const html = emailWrapper(`
    <h2 style="margin:0 0 8px;font-size:20px;color:#111;">Welcome to ChangeAI, ${name}!</h2>
    <p style="color:#6b7280;font-size:14px;line-height:1.6;">
      Your email has been verified and your account is ready. Here's what you can do:
    </p>
    <ul style="color:#374151;font-size:14px;line-height:2;padding-left:20px;">
      <li><strong>AI Assistant</strong> — Chat about change management with contextual AI</li>
      <li><strong>Assessments</strong> — Run ADKAR, stakeholder maps, readiness checks and more</li>
      <li><strong>Digital Playbooks</strong> — Generate sitemaps and implementation plans</li>
      <li><strong>Knowledge Base</strong> — Upload your documents to personalise the AI</li>
    </ul>
    <div style="margin:24px 0;text-align:center;">
      <a href="https://cmp-frontend-gamma.vercel.app/dashboard" style="display:inline-block;background:#C3E11D;color:#0B1444;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
        Go to Dashboard
      </a>
    </div>
    <p style="color:#9ca3af;font-size:12px;">Need help? Visit the Help Center in your dashboard or reply to this email.</p>
  `);

  try {
    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: email,
      subject: 'Welcome to ChangeAI — You\'re all set!',
      text: `Welcome to ChangeAI, ${name}! Your email has been verified. Visit your dashboard: https://cmp-frontend-gamma.vercel.app/dashboard`,
      html,
    });
    if (error) throw new Error(error.message);
    logger.info(`Welcome email sent to ${email} (id: ${data.id})`);
  } catch (error) {
    logger.error(`Failed to send welcome email to ${email}: ${error.message}`);
    // Non-blocking — don't throw, user is already verified
  }
};

module.exports = {
  sendVerificationEmail,
  sendForgotPasswordEmail,
  sendInviteEmail,
  sendWelcomeEmail,
};
