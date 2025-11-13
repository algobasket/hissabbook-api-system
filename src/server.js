const path = require("path");
const dotenv = require("dotenv");

// Load .env file from the project root
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

// Debug: Log if API keys are loaded
console.log("FAST2SMS_API_KEY loaded:", !!process.env.FAST2SMS_API_KEY);
console.log("FAST2SMS_API_KEY value:", process.env.FAST2SMS_API_KEY ? `${process.env.FAST2SMS_API_KEY.substring(0, 10)}...` : "NOT SET");

// Debug: Log if Gmail SMTP is configured
const smtpUser = process.env.SMTP_USER || process.env.GMAIL_USER;
const smtpPassword = process.env.SMTP_PASSWORD || process.env.GMAIL_APP_PASSWORD;
console.log("Gmail SMTP configured:", !!smtpUser && !!smtpPassword);
console.log("Gmail SMTP user:", smtpUser || "NOT SET");
console.log("Gmail SMTP password:", smtpPassword ? "SET" : "NOT SET");

// Verify Gmail SMTP connection on startup (optional)
if (smtpUser && smtpPassword) {
  const { createTransporter } = require("./utils/email");
  try {
    const transporter = createTransporter();
    transporter.verify((error, success) => {
      if (error) {
        console.error("❌ Gmail SMTP verification failed:", error.message);
        console.error("   Please check your Gmail SMTP configuration in .env file");
        console.error("   See GMAIL_SETUP.md for setup instructions");
      } else {
        console.log("✅ Gmail SMTP server is ready to send emails");
      }
    });
  } catch (error) {
    console.error("❌ Gmail SMTP configuration error:", error.message);
  }
}

const buildApp = require("./app");

const PORT = 4000;
const HOST = process.env.HOST || "0.0.0.0";

async function start() {
  const app = await buildApp();

  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`API listening on http://${HOST}:${PORT}`);
  } catch (error) {
    app.log.error(error, "Failed to start server");
    process.exit(1);
  }
}

start();

