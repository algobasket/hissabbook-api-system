const { fetch } = require("undici");
const { sendOtpEmail } = require("../utils/email");

const OTP_TTL_MINUTES = Number(process.env.OTP_TTL_MINUTES || 5);

function generateOtpCode() {
  return (Math.floor(100000 + Math.random() * 900000)).toString();
}

function formatPhoneNumber(phone) {
  // Remove any non-digit characters (including +, spaces, hyphens)
  let cleaned = phone.replace(/\D/g, "");
  
  if (!cleaned || cleaned.length < 10) {
    throw new Error(`Invalid phone number format: ${phone}. Phone number is too short.`);
  }
  
  // Handle different phone number formats for Indian numbers
  // If phone starts with 0 and is 11 digits (e.g., 09876543210), replace 0 with 91
  if (cleaned.startsWith("0") && cleaned.length === 11) {
    cleaned = "91" + cleaned.substring(1);
  }
  // If phone is exactly 10 digits (e.g., 9876543210), prepend country code 91
  else if (cleaned.length === 10) {
    cleaned = "91" + cleaned;
  }
  // If phone already starts with 91, validate it's proper length (12 digits for India)
  else if (cleaned.startsWith("91") && cleaned.length === 12) {
    // Already properly formatted, use as is
  }
  // If phone has country code but not 91, or is longer, validate length
  else if (cleaned.length > 15) {
    throw new Error(`Invalid phone number format: ${phone}. Phone number is too long (${cleaned.length} digits).`);
  }
  
  // Final validation: should be 10-15 digits after formatting
  if (cleaned.length < 10 || cleaned.length > 15) {
    throw new Error(`Invalid phone number format: ${phone}. Expected 10-15 digits, got ${cleaned.length} after formatting.`);
  }
  
  return cleaned;
}

async function sendOtpSms({ code, phone }) {
  const apiKey = process.env.FAST2SMS_API_KEY;
  const otpUrl = process.env.OTP_URL || "https://www.fast2sms.com/dev/bulkV2";
  const scheduleTime = process.env.FAST2SMS_SCHEDULE_TIME || undefined;

  if (!apiKey) {
    throw new Error("Fast2SMS API key missing");
  }

  // Format phone number (remove +, spaces, etc.)
  let formattedPhone;
  try {
    formattedPhone = formatPhoneNumber(phone);
  } catch (error) {
    throw new Error(`Phone number validation failed: ${error.message}`);
  }

  const payload = {
    route: "otp",
    variables_values: code,
    numbers: formattedPhone,
  };

  if (scheduleTime) {
    payload.schedule_time = scheduleTime;
  }

  // Log request details (without API key) for debugging
  const requestPayload = {
    route: payload.route,
    variables_values: payload.variables_values,
    numbers: formattedPhone,
    schedule_time: payload.schedule_time,
  };

  const response = await fetch(otpUrl, {
    method: "POST",
    headers: {
      authorization: apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  // Read response body
  const responseText = await response.text();
  let data;
  
  try {
    data = JSON.parse(responseText);
  } catch (parseError) {
    // If response is not JSON, throw error with raw text
    const error = new Error(
      `Fast2SMS request failed with status ${response.status}. Response: ${responseText.substring(0, 500)}`,
    );
    error.requestPayload = requestPayload;
    error.responseText = responseText;
    throw error;
  }

  if (!response.ok) {
    // Extract error message from Fast2SMS response
    const errorMessage = data.message
      ? Array.isArray(data.message)
        ? data.message.join(", ")
        : data.message
      : data.status_code
        ? `Error code: ${data.status_code}`
        : data.request_id
          ? `Request ID: ${data.request_id}`
          : responseText || "Unknown error";
    
    const error = new Error(
      `Fast2SMS request failed with status ${response.status}: ${errorMessage}`,
    );
    error.requestPayload = requestPayload;
    error.responseData = data;
    error.statusCode = response.status;
    throw error;
  }

  if (!data.return) {
    throw new Error(
      `Fast2SMS error: ${Array.isArray(data.message) ? data.message.join(", ") : data.message || "Unknown error"}`,
    );
  }

  return data;
}

async function otpRoutes(app) {
  app.post("/request", {
    schema: {
      body: {
        type: "object",
        required: ["phone"],
        properties: {
          phone: { type: "string", minLength: 8 },
        },
      },
    },
  }, async (request, reply) => {
    const { phone } = request.body;
    const code = generateOtpCode();
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    try {
      await sendOtpSms({ code, phone });

      await app.pg.query(
        `INSERT INTO public.otp_codes (phone, code, expires_at)
         VALUES ($1, $2, $3)`,
        [phone, code, expiresAt],
      );

      reply.send({ success: true, expiresAt });
    } catch (error) {
      // Log detailed error information for debugging
      request.log.error({
        err: error,
        phone: phone,
        requestPayload: error.requestPayload,
        responseData: error.responseData,
        statusCode: error.statusCode,
        responseText: error.responseText,
      }, "Failed to send OTP");
      
      // Return error message to client (without exposing internal details)
      const errorMessage = error.message || "Failed to send OTP";
      reply.code(500).send({ message: errorMessage });
    }
  });

  app.post("/verify", {
    schema: {
      body: {
        type: "object",
        required: ["code"],
        properties: {
          phone: { type: "string", minLength: 8 },
          email: { type: "string", format: "email" },
          code: { type: "string", minLength: 4 },
        },
      },
    },
  }, async (request, reply) => {
    const { phone, email, code } = request.body;

    if (!phone && !email) {
      return reply.code(400).send({ message: "Either phone or email is required" });
    }

    try {
      let query, params;
      if (phone) {
        query = `SELECT id, code, used, expires_at
                 FROM public.otp_codes
                 WHERE phone = $1
                 ORDER BY created_at DESC
                 LIMIT 1`;
        params = [phone];
      } else {
        query = `SELECT id, code, used, expires_at
                 FROM public.otp_codes
                 WHERE email = $1
                 ORDER BY created_at DESC
                 LIMIT 1`;
        params = [email.toLowerCase()];
      }

      const { rows } = await app.pg.query(query, params);

      if (!rows.length) {
        return reply.code(400).send({ message: "OTP not found" });
      }

      const otp = rows[0];
      const now = new Date();

      if (otp.used) {
        return reply.code(400).send({ message: "OTP already used" });
      }

      if (now > otp.expires_at) {
        return reply.code(400).send({ message: "OTP expired" });
      }

      if (otp.code !== code) {
        return reply.code(400).send({ message: "Invalid OTP" });
      }

      await app.pg.query(
        `UPDATE public.otp_codes SET used = true WHERE id = $1`,
        [otp.id],
      );

      reply.send({ success: true });
    } catch (error) {
      request.log.error({ err: error }, "Failed to verify OTP");
      reply.code(500).send({ message: "Failed to verify OTP" });
    }
  });

  // Email OTP routes
  app.post("/email/request", {
    schema: {
      body: {
        type: "object",
        required: ["email"],
        properties: {
          email: { type: "string", format: "email" },
        },
      },
    },
  }, async (request, reply) => {
    const { email } = request.body;
    const code = generateOtpCode();
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    try {
      await sendOtpEmail({ code, email });

      await app.pg.query(
        `INSERT INTO public.otp_codes (email, code, expires_at)
         VALUES ($1, $2, $3)`,
        [email.toLowerCase(), code, expiresAt],
      );

      reply.send({ success: true, expiresAt });
    } catch (error) {
      // Log detailed error information for debugging
      request.log.error({
        err: error,
        email: email,
      }, "Failed to send email OTP");
      
      // Return error message to client (without exposing internal details)
      const errorMessage = error.message || "Failed to send OTP";
      reply.code(500).send({ message: errorMessage });
    }
  });

  app.post("/email/verify", {
    schema: {
      body: {
        type: "object",
        required: ["email", "code"],
        properties: {
          email: { type: "string", format: "email" },
          code: { type: "string", minLength: 4 },
        },
      },
    },
  }, async (request, reply) => {
    const { email, code } = request.body;

    try {
      const { rows } = await app.pg.query(
        `SELECT id, code, used, expires_at
         FROM public.otp_codes
         WHERE email = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [email.toLowerCase()],
      );

      if (!rows.length) {
        return reply.code(400).send({ message: "OTP not found" });
      }

      const otp = rows[0];
      const now = new Date();

      if (otp.used) {
        return reply.code(400).send({ message: "OTP already used" });
      }

      if (now > otp.expires_at) {
        return reply.code(400).send({ message: "OTP expired" });
      }

      if (otp.code !== code) {
        return reply.code(400).send({ message: "Invalid OTP" });
      }

      await app.pg.query(
        `UPDATE public.otp_codes SET used = true WHERE id = $1`,
        [otp.id],
      );

      reply.send({ success: true });
    } catch (error) {
      request.log.error({ err: error }, "Failed to verify email OTP");
      reply.code(500).send({ message: "Failed to verify OTP" });
    }
  });
}

module.exports = otpRoutes;

