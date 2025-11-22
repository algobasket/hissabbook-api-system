const { verifyPassword } = require("../utils/password");
const {
  findUserByEmail,
  findUserByPhone,
  createUser,
  getUserRoles,
  assignRole,
  getUserDetails,
  updateUserDetails,
} = require("../services/userService");
const { saveImageToDisk, deleteImageFromDisk } = require("../utils/fileUpload");

async function authRoutes(app) {
  app.post(
    "/register",
    {
      schema: {
        body: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string", minLength: 8 },
            firstName: { type: "string" },
            lastName: { type: "string" },
            phone: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { email, password, firstName, lastName, phone } = request.body;
      const existing = await findUserByEmail(app.pg, email);

      if (existing) {
        return reply.code(409).send({ message: "Email already registered" });
      }

      const user = await createUser(app.pg, {
        email,
        password,
        firstName: firstName || null,
        lastName: lastName || null,
        phone,
        role: "managers", // Default role for regular users (managers are end users)
      });

      // Get user roles
      const roles = await getUserRoles(app.pg, user.id);
      const primaryRole = roles[0] || "managers";

      const token = app.jwt.sign({
        sub: user.id,
        email: user.email,
        status: user.status,
        roles: roles,
        role: primaryRole, // Primary role for quick access
      });

      return reply.code(201).send({
        token,
        user: {
          id: user.id,
          email: user.email,
          status: user.status,
          roles: roles,
          role: primaryRole,
          createdAt: user.created_at,
        },
      });
    },
  );

  app.post(
    "/login",
    {
      schema: {
        body: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string", minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;

      const user = await findUserByEmail(app.pg, email);

      if (!user) {
        return reply.code(401).send({ message: "Invalid email or password" });
      }

      const isValid = await verifyPassword(password, user.password_hash);

      if (!isValid) {
        return reply.code(401).send({ message: "Invalid email or password" });
      }

      await app.pg.query(
        "UPDATE public.users SET last_login_at = now(), updated_at = now() WHERE id = $1",
        [user.id],
      );

      // Get user roles
      const roles = await getUserRoles(app.pg, user.id);
      const primaryRole = roles[0] || "managers";

      const token = app.jwt.sign({
        sub: user.id,
        email: user.email,
        status: user.status,
        roles: roles,
        role: primaryRole,
      });

      return reply.send({
        token,
        user: {
          id: user.id,
          email: user.email,
          status: user.status,
          roles: roles,
          role: primaryRole,
        },
      });
    },
  );

  app.post(
    "/logout",
    { preValidation: [app.authenticate] },
    async (request, reply) => {
      // For stateless JWT auth we simply rely on client to discard token.
      return reply.send({ success: true });
    },
  );

  app.get(
    "/me",
    { preValidation: [app.authenticate] },
    async (request) => {
      const user = await findUserByEmail(app.pg, request.user.email);
      const roles = await getUserRoles(app.pg, user.id);
      const primaryRole = roles[0] || "managers";
      const userDetails = await getUserDetails(app.pg, user.id);

      // Parse metadata if it's a string
      let metadata = {};
      if (userDetails?.metadata) {
        if (typeof userDetails.metadata === 'object') {
          metadata = userDetails.metadata;
        } else {
          try {
            metadata = typeof userDetails.metadata === 'string' ? JSON.parse(userDetails.metadata) : {};
          } catch {
            metadata = {};
          }
        }
      }

      const fullName = userDetails
        ? [userDetails.first_name, userDetails.last_name].filter(Boolean).join(" ").trim()
        : null;

      return {
        user: {
          id: user.id,
          email: user.email,
          status: user.status,
          roles: roles,
          role: primaryRole,
          createdAt: user.created_at,
          lastLoginAt: user.last_login_at,
          // User details
          firstName: userDetails?.first_name || null,
          lastName: userDetails?.last_name || null,
          fullName: fullName || null,
          phone: userDetails?.phone || null,
          upiId: userDetails?.upi_id || null,
          gstin: metadata.gstin || null,
          address: userDetails?.address || null,
        },
      };
    },
  );

  // Get user account details
  app.get(
    "/account-details",
    { preValidation: [app.authenticate] },
    async (request) => {
      const user = await findUserByEmail(app.pg, request.user.email);
      const userDetails = await getUserDetails(app.pg, user.id);

      // Get user roles
      const roles = await getUserRoles(app.pg, user.id);
      const primaryRole = roles[0] || "managers";

      if (!userDetails) {
        return {
          email: user.email,
          name: null,
          firstName: null,
          lastName: null,
          gstin: null,
          phone: null,
          upiId: null,
          upiQrCode: null,
          role: primaryRole,
          roles: roles,
        };
      }

      // Parse metadata if it's a string
      let metadata = {};
      if (userDetails.metadata) {
        if (typeof userDetails.metadata === 'object') {
          metadata = userDetails.metadata;
        } else {
          try {
            metadata = typeof userDetails.metadata === 'string' ? JSON.parse(userDetails.metadata) : {};
          } catch {
            metadata = {};
          }
        }
      }

      const fullName = [userDetails.first_name, userDetails.last_name].filter(Boolean).join(" ").trim() || null;

      return {
        email: user.email,
        name: fullName,
        firstName: userDetails.first_name || null,
        lastName: userDetails.last_name || null,
        gstin: metadata.gstin || null,
        phone: userDetails.phone || null,
        upiId: userDetails.upi_id || null,
        upiQrCode: userDetails.upi_qr_code || null,
        role: primaryRole,
        roles: roles,
      };
    },
  );

  // Update user account details
  app.put(
    "/account-details",
    {
      preValidation: [app.authenticate],
      schema: {
        body: {
          type: "object",
          properties: {
            name: { type: "string" },
            firstName: { type: "string" },
            lastName: { type: "string" },
            gstin: { type: "string" },
            phone: { type: "string" },
            upiId: { type: "string" },
            upiQrCode: { type: "string" }, // Base64 image string
          },
        },
      },
    },
    async (request, reply) => {
      const user = await findUserByEmail(app.pg, request.user.email);
      const { name, firstName, lastName, gstin, phone, upiId, upiQrCode } = request.body;

      // Get existing details to check for old QR code
      const existing = await getUserDetails(app.pg, user.id);
      let qrCodeFilename = existing?.upi_qr_code || null;

      // Handle QR code upload
      if (upiQrCode !== undefined) {
        try {
          // If a new QR code is provided, save it
          if (upiQrCode && upiQrCode.trim() !== "") {
            // Delete old QR code if it exists
            if (qrCodeFilename) {
              await deleteImageFromDisk(qrCodeFilename);
            }
            // Save new QR code
            qrCodeFilename = await saveImageToDisk(upiQrCode, "qr-code");
          } else if (upiQrCode === null || upiQrCode === "") {
            // If QR code is explicitly set to empty, delete the old one
            if (qrCodeFilename) {
              await deleteImageFromDisk(qrCodeFilename);
              qrCodeFilename = null;
            }
          }
        } catch (error) {
          request.log.error({ err: error }, "Failed to save QR code image");
          return reply.code(400).send({ message: `Failed to save QR code: ${error.message}` });
        }
      }

      // If name is provided, split it into first and last name
      let finalFirstName = firstName;
      let finalLastName = lastName;

      if (name && !firstName && !lastName) {
        const nameParts = name.trim().split(/\s+/);
        finalFirstName = nameParts[0] || null;
        finalLastName = nameParts.slice(1).join(" ") || null;
      }

      const updatedDetails = await updateUserDetails(app.pg, user.id, {
        firstName: finalFirstName,
        lastName: finalLastName,
        gstin,
        phone,
        upiId,
        upiQrCode: qrCodeFilename,
      });

      if (!updatedDetails) {
        return reply.code(500).send({ message: "Failed to update account details" });
      }

      // Parse metadata if it's a string
      let metadata = {};
      if (updatedDetails.metadata) {
        if (typeof updatedDetails.metadata === 'object') {
          metadata = updatedDetails.metadata;
        } else {
          try {
            metadata = typeof updatedDetails.metadata === 'string' ? JSON.parse(updatedDetails.metadata) : {};
          } catch {
            metadata = {};
          }
        }
      }

      const fullName = [updatedDetails.first_name, updatedDetails.last_name].filter(Boolean).join(" ").trim() || null;

      // Get user roles
      const roles = await getUserRoles(app.pg, user.id);
      const primaryRole = roles[0] || "managers";

      return reply.send({
        success: true,
        accountDetails: {
          email: user.email,
          name: fullName,
          firstName: updatedDetails.first_name || null,
          lastName: updatedDetails.last_name || null,
          gstin: metadata.gstin || null,
          phone: updatedDetails.phone || null,
          upiId: updatedDetails.upi_id || null,
          upiQrCode: updatedDetails.upi_qr_code || null,
          role: primaryRole,
          roles: roles,
        },
      });
    },
  );

  // Change password endpoint
  app.put(
    "/change-password",
    {
      preValidation: [app.authenticate],
      schema: {
        body: {
          type: "object",
          required: ["currentPassword", "newPassword"],
          properties: {
            currentPassword: { type: "string", minLength: 1 },
            newPassword: { type: "string", minLength: 8 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const user = await findUserByEmail(app.pg, request.user.email);
        if (!user) {
          return reply.code(404).send({ message: "User not found" });
        }

        const { currentPassword, newPassword } = request.body;

        // Verify current password
        const isValid = await verifyPassword(currentPassword, user.password_hash);
        if (!isValid) {
          return reply.code(401).send({ message: "Current password is incorrect" });
        }

        // Hash new password
        const { hashPassword } = require("../utils/password");
        const passwordHash = await hashPassword(newPassword);

        // Update password
        await app.pg.query(
          "UPDATE public.users SET password_hash = $1, updated_at = now() WHERE id = $2",
          [passwordHash, user.id]
        );

        return reply.send({
          success: true,
          message: "Password changed successfully",
        });
      } catch (error) {
        request.log.error({ err: error }, "Failed to change password");
        return reply.code(500).send({
          message: "Failed to change password",
          error: error.message,
        });
      }
    }
  );

  // Create user after email OTP verification (no password required)
  app.post(
    "/create-user",
    {
      schema: {
        body: {
          type: "object",
          required: ["email"],
          properties: {
            email: { type: "string", format: "email" },
          },
        },
      },
    },
    async (request, reply) => {
      const { email } = request.body;
      
      // Check if user already exists
      const existing = await findUserByEmail(app.pg, email);
      
      if (existing) {
        // User exists, update last login and return token
        await app.pg.query(
          "UPDATE public.users SET last_login_at = now(), updated_at = now() WHERE id = $1",
          [existing.id],
        );

        // Get user roles
        const roles = await getUserRoles(app.pg, existing.id);
        const primaryRole = roles[0] || "managers";

        const token = app.jwt.sign({
          sub: existing.id,
          email: existing.email,
          status: existing.status,
          roles: roles,
          role: primaryRole,
        });

        return reply.send({
          token,
          user: {
            id: existing.id,
            email: existing.email,
            status: existing.status,
            roles: roles,
            role: primaryRole,
          },
        });
      }

      // Create new user (no password required for OTP-based auth)
      // Default role is "managers" for users created via email OTP (managers are end users)
      const user = await createUser(app.pg, {
        email,
        role: "managers",
      });

      // Get user roles
      const roles = await getUserRoles(app.pg, user.id);
      const primaryRole = roles[0] || "managers";

      const token = app.jwt.sign({
        sub: user.id,
        email: user.email,
        status: user.status,
        roles: roles,
        role: primaryRole,
      });

      return reply.code(201).send({
        token,
        user: {
          id: user.id,
          email: user.email,
          status: user.status,
          roles: roles,
          role: primaryRole,
          createdAt: user.created_at,
        },
      });
    },
  );

  // Create user after phone OTP verification (no password required)
  app.post(
    "/create-user-phone",
    {
      schema: {
        body: {
          type: "object",
          required: ["phone"],
          properties: {
            phone: { type: "string", minLength: 8 },
          },
        },
      },
    },
    async (request, reply) => {
      const { phone } = request.body;

      // Format phone number (same logic as in OTP routes)
      let formattedPhone = phone.replace(/\D/g, "");
      if (formattedPhone.startsWith("0") && formattedPhone.length === 11) {
        formattedPhone = "91" + formattedPhone.substring(1);
      } else if (formattedPhone.length === 10) {
        formattedPhone = "91" + formattedPhone;
      }

      // Check if user already exists by phone
      const existing = await findUserByPhone(app.pg, formattedPhone);

      if (existing) {
        // User exists, update last login and return token
        await app.pg.query(
          "UPDATE public.users SET last_login_at = now(), updated_at = now() WHERE id = $1",
          [existing.id],
        );

        // Get user roles
        const roles = await getUserRoles(app.pg, existing.id);
        const primaryRole = roles[0] || "managers";

        const token = app.jwt.sign({
          sub: existing.id,
          email: existing.email,
          status: existing.status,
          roles: roles,
          role: primaryRole,
        });

        return reply.send({
          token,
          user: {
            id: existing.id,
            email: existing.email,
            status: existing.status,
            roles: roles,
            role: primaryRole,
          },
        });
      }

      // Create new user with phone (no email required for phone-based auth)
      // Generate a temporary email if not provided
      const tempEmail = `phone_${formattedPhone}@hissabbook.temp`;
      const user = await createUser(app.pg, {
        email: tempEmail,
        phone: formattedPhone,
        role: "managers", // Default role for phone-based users (managers are end users)
      });

      // Get user roles
      const roles = await getUserRoles(app.pg, user.id);
      const primaryRole = roles[0] || "managers";

      const token = app.jwt.sign({
        sub: user.id,
        email: user.email,
        status: user.status,
        roles: roles,
        role: primaryRole,
      });

      return reply.code(201).send({
        token,
        user: {
          id: user.id,
          email: user.email,
          status: user.status,
          roles: roles,
          role: primaryRole,
          phone: formattedPhone,
          createdAt: user.created_at,
        },
      });
    },
  );

  // Check if email exists (public endpoint)
  app.get("/check-email", {
    schema: {
      querystring: {
        type: "object",
        required: ["email"],
        properties: {
          email: { type: "string", format: "email" },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const { email } = request.query;
      const user = await findUserByEmail(app.pg, email);
      return reply.send({ exists: !!user });
    } catch (error) {
      request.log.error({ err: error }, "Failed to check email");
      return reply.code(500).send({ message: "Failed to check email", exists: false });
    }
  });
}

module.exports = authRoutes;

