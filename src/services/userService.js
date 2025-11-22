const { v4: uuidv4 } = require("uuid");
const { hashPassword } = require("../utils/password");

async function findUserByEmail(pool, email) {
  const result = await pool.query(
    "SELECT * FROM public.users WHERE email = $1 LIMIT 1",
    [email.toLowerCase()],
  );
  return result.rows[0];
}

async function findUserByPhone(pool, phone) {
  const result = await pool.query(
    `SELECT u.* FROM public.users u
     INNER JOIN public.user_details ud ON u.id = ud.user_id
     WHERE ud.phone = $1 LIMIT 1`,
    [phone],
  );
  return result.rows[0];
}

async function getUserRoles(pool, userId) {
  const result = await pool.query(
    `SELECT r.name, r.description
     FROM public.user_roles ur
     INNER JOIN public.roles r ON ur.role_id = r.id
     WHERE ur.user_id = $1`,
    [userId],
  );
  return result.rows.map((row) => row.name);
}

async function assignRole(pool, userId, roleName) {
  // Get role ID
  const roleResult = await pool.query(
    "SELECT id FROM public.roles WHERE name = $1",
    [roleName],
  );

  if (roleResult.rows.length === 0) {
    throw new Error(`Role '${roleName}' not found`);
  }

  const roleId = roleResult.rows[0].id;

  // Assign role to user (ignore if already assigned)
  await pool.query(
    `INSERT INTO public.user_roles (user_id, role_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, role_id) DO NOTHING`,
    [userId, roleId],
  );
}

async function getUserDetails(pool, userId) {
  const result = await pool.query(
    `SELECT 
      ud.user_id,
      ud.first_name,
      ud.last_name,
      ud.phone,
      ud.upi_id,
      ud.upi_qr_code,
      ud.address,
      ud.metadata
     FROM public.user_details ud
     WHERE ud.user_id = $1`,
    [userId],
  );
  return result.rows[0] || null;
}

async function updateUserDetails(pool, userId, { firstName, lastName, phone, upiId, gstin, address, upiQrCode }) {
  // Get existing details first
  const existing = await getUserDetails(pool, userId);
  
  // Handle metadata
  let metadata = {};
  if (existing?.metadata) {
    // If metadata is already an object, use it; otherwise parse it
    if (typeof existing.metadata === 'object') {
      metadata = { ...existing.metadata };
    } else {
      try {
        metadata = typeof existing.metadata === 'string' ? JSON.parse(existing.metadata) : {};
      } catch {
        metadata = {};
      }
    }
  }
  
  // Update GSTIN in metadata if provided
  if (gstin !== undefined) {
    metadata.gstin = gstin || null;
  }

  // Prepare values for UPSERT
  const finalFirstName = firstName !== undefined ? (firstName || null) : (existing?.first_name || null);
  const finalLastName = lastName !== undefined ? (lastName || null) : (existing?.last_name || null);
  const finalPhone = phone !== undefined ? (phone || null) : (existing?.phone || null);
  const finalUpiId = upiId !== undefined ? (upiId || null) : (existing?.upi_id || null);
  const finalUpiQrCode = upiQrCode !== undefined ? (upiQrCode || null) : (existing?.upi_qr_code || null);
  const finalAddress = address !== undefined ? (address ? JSON.stringify(address) : null) : (existing?.address || null);

  // Use UPSERT to handle both insert and update
  const upsertQuery = `
    INSERT INTO public.user_details (user_id, first_name, last_name, phone, upi_id, upi_qr_code, metadata, address, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
    ON CONFLICT (user_id) DO UPDATE
    SET 
      first_name = COALESCE(EXCLUDED.first_name, user_details.first_name),
      last_name = COALESCE(EXCLUDED.last_name, user_details.last_name),
      phone = COALESCE(EXCLUDED.phone, user_details.phone),
      upi_id = COALESCE(EXCLUDED.upi_id, user_details.upi_id),
      upi_qr_code = COALESCE(EXCLUDED.upi_qr_code, user_details.upi_qr_code),
      metadata = COALESCE(EXCLUDED.metadata::jsonb, user_details.metadata),
      address = COALESCE(EXCLUDED.address::jsonb, user_details.address),
      updated_at = now()
    RETURNING user_id, first_name, last_name, phone, upi_id, upi_qr_code, address, metadata
  `;

  const result = await pool.query(upsertQuery, [
    userId,
    finalFirstName,
    finalLastName,
    finalPhone,
    finalUpiId,
    finalUpiQrCode,
    JSON.stringify(metadata),
    finalAddress,
  ]);

  return result.rows[0];
}

async function createUser(pool, { email, password, firstName, lastName, phone, role = "managers" }) {
  const id = uuidv4();
  // If password is not provided (for OTP-based auth), create a random password hash
  // In production, you might want to handle OTP-only users differently
  const passwordHash = password
    ? await hashPassword(password)
    : await hashPassword(uuidv4() + Date.now().toString());

  const result = await pool.query(
    `INSERT INTO public.users (id, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, email, status, created_at, updated_at`,
    [id, email.toLowerCase(), passwordHash],
  );

  const user = result.rows[0];

  // Create user details if provided (always create user_details for phone-based users)
  // Create user_details if any detail is provided, or if email looks like a temp email
  if (firstName || lastName || phone || email.includes("@hissabbook.temp")) {
    await pool.query(
      `INSERT INTO public.user_details (user_id, first_name, last_name, phone)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE
       SET first_name = COALESCE(EXCLUDED.first_name, user_details.first_name),
           last_name = COALESCE(EXCLUDED.last_name, user_details.last_name),
           phone = COALESCE(EXCLUDED.phone, user_details.phone),
           updated_at = now()`,
      [user.id, firstName || null, lastName || null, phone || null],
    );
  }

  // Assign default role (staff for regular users)
  try {
    await assignRole(pool, user.id, role);
  } catch (error) {
    // If role assignment fails, log but don't fail user creation
    console.error(`Failed to assign role '${role}' to user ${user.id}:`, error.message);
  }

  return user;
}

module.exports = {
  findUserByEmail,
  findUserByPhone,
  createUser,
  getUserRoles,
  assignRole,
  getUserDetails,
  updateUserDetails,
};

