const nodemailer = require("nodemailer");

// Create reusable transporter for Gmail SMTP
function createTransporter() {
  // Gmail SMTP configuration
  const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  const smtpSecure = process.env.SMTP_SECURE === "true" || smtpPort === 465; // true for 465, false for 587
  const smtpUser = process.env.SMTP_USER || process.env.GMAIL_USER;
  const smtpPassword = process.env.SMTP_PASSWORD || process.env.GMAIL_APP_PASSWORD;

  if (!smtpUser || !smtpPassword) {
    throw new Error(
      "Gmail SMTP configuration missing. Please set SMTP_USER (or GMAIL_USER) and SMTP_PASSWORD (or GMAIL_APP_PASSWORD) environment variables.",
    );
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure, // true for 465, false for other ports (587 uses STARTTLS)
    auth: {
      user: smtpUser,
      pass: smtpPassword, // Use Gmail App Password, not regular password
    },
    // Gmail specific settings
    tls: {
      // Do not fail on invalid certs (for local development)
      rejectUnauthorized: process.env.NODE_ENV !== "production",
    },
  });

  return transporter;
}

async function sendOtpEmail({ code, email }) {
  const smtpUser = process.env.SMTP_USER || process.env.GMAIL_USER;
  const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.GMAIL_FROM_EMAIL || smtpUser || "noreply@hissabbook.com";

  if (!smtpUser) {
    throw new Error(
      "Gmail SMTP configuration missing. Please set SMTP_USER (or GMAIL_USER) environment variable.",
    );
  }

  const transporter = createTransporter();

  const mailOptions = {
    from: `"HissabBook" <${fromEmail}>`,
    to: email,
    subject: "Your HissabBook OTP Code",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #2f4bff 0%, #2357FF 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px;">HissabBook</h1>
        </div>
        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
          <h2 style="color: #111827; margin-top: 0;">Your OTP Code</h2>
          <p style="color: #6b7280; font-size: 16px; line-height: 1.6;">
            Use the following code to verify your email address:
          </p>
          <div style="background: white; padding: 20px; border-radius: 8px; text-align: center; margin: 30px 0; border: 2px dashed #2f4bff;">
            <div style="font-size: 36px; font-weight: bold; color: #2f4bff; letter-spacing: 8px; font-family: 'Courier New', monospace;">
              ${code}
            </div>
          </div>
          <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
            This code will expire in ${process.env.OTP_TTL_MINUTES || 5} minutes.
          </p>
          <p style="color: #9ca3af; font-size: 12px; line-height: 1.6; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            If you didn't request this code, please ignore this email.
          </p>
        </div>
      </div>
    `,
    text: `
      HissabBook - Your OTP Code
      
      Use the following code to verify your email address: ${code}
      
      This code will expire in ${process.env.OTP_TTL_MINUTES || 5} minutes.
      
      If you didn't request this code, please ignore this email.
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }
}

module.exports = {
  sendOtpEmail,
  createTransporter,
};

