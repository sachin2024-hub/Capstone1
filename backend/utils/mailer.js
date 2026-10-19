const nodemailer = require('nodemailer');

let transporter;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

async function sendResetOtpEmail(to, username, otp, minutes) {
  await getTransporter().sendMail({
    from: `"RapidRescue Admin" <${process.env.SMTP_USER}>`,
    to,
    subject: 'RapidRescue password reset code',
    text:
      `A password reset was requested for admin account @${username}.\n\n` +
      `Your verification code is: ${otp}\n\n` +
      `It expires in ${minutes} minutes. If you did not request this, ignore this email.`,
    html:
      `<div style="font-family:Arial,sans-serif;max-width:420px">` +
      `<h2 style="color:#c62828">RapidRescue</h2>` +
      `<p>A password reset was requested for admin account <b>@${username}</b>.</p>` +
      `<p>Your verification code:</p>` +
      `<p style="font-size:32px;font-weight:800;letter-spacing:8px">${otp}</p>` +
      `<p>It expires in ${minutes} minutes. If you did not request this, ignore this email.</p></div>`,
  });
}

module.exports = { sendResetOtpEmail };
