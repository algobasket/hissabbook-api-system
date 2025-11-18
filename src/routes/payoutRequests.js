const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

async function saveProofToDisk(base64String) {
  if (!base64String) {
    return null;
  }

  const matches = base64String.match(/^data:(.+);base64,(.+)$/);
  if (!matches) {
    throw new Error("Invalid proof format");
  }

  const mimeType = matches[1];
  const data = matches[2];
  const buffer = Buffer.from(data, "base64");

  const extension = mimeType.split("/")[1] || "bin";
  const uniqueId = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");
  const fileName = `payout-${Date.now()}-${uniqueId}.${extension}`;
  const uploadDir = path.join(process.cwd(), "uploads");
  await fs.mkdir(uploadDir, { recursive: true });
  const filePath = path.join(uploadDir, fileName);
  await fs.writeFile(filePath, buffer);
  return fileName;
}

const { findUserByEmail } = require("../services/userService");

// Format amount to Indian Rupees
function formatAmount(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// Format date to "DD MMM YYYY"
function formatDate(dateString) {
  if (!dateString) return "--";
  const date = new Date(dateString);
  const day = date.getDate();
  const month = date.toLocaleString("en-US", { month: "short" });
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

// Generate reference ID
function generateReference(id, createdAt) {
  const year = new Date(createdAt).getFullYear();
  const shortId = id.substring(0, 8).toUpperCase();
  return `PYT-${year}-${shortId}`;
}

async function payoutRequestRoutes(app) {
  // Create payout request
  app.post(
    "/",
    {
      preValidation: [app.authenticate],
      schema: {
        body: {
          type: "object",
          required: ["amount", "utr", "remarks", "proof"],
          properties: {
            amount: { type: "number", minimum: 0.01 },
            utr: { type: "string", minLength: 4 },
            remarks: { type: "string", minLength: 1 },
            proof: { type: "string", minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const { amount, utr, remarks, proof } = request.body;

      try {
        // Get user from JWT
        const user = await findUserByEmail(app.pg, request.user.email);
        if (!user) {
          return reply.code(404).send({ message: "User not found" });
        }

        const proofFilename = await saveProofToDisk(proof);

        const result = await app.pg.query(
          `INSERT INTO public.payout_requests (user_id, amount, utr, remarks, proof_filename, status)
           VALUES ($1, $2, $3, $4, $5, 'pending')
           RETURNING id, status, created_at, proof_filename, amount`,
          [user.id, amount, utr, remarks, proofFilename],
        );

        reply.code(201).send({ request: result.rows[0] });
      } catch (error) {
        request.log.error({ err: error }, "Failed to create payout request");
        reply.code(500).send({ message: "Failed to create payout request" });
      }
    },
  );

  // Get all payout requests with summaries
  app.get(
    "/",
    {
      preValidation: [app.authenticate],
    },
    async (request, reply) => {
      try {
        // Get user from JWT
        const user = await findUserByEmail(app.pg, request.user.email);
        if (!user) {
          return reply.code(404).send({ message: "User not found" });
        }

        // Get user's role to determine if they can see all requests
        const roles = await app.pg.query(
          `SELECT r.name as role_name
           FROM public.user_roles ur
           JOIN public.roles r ON ur.role_id = r.id
           WHERE ur.user_id = $1
           LIMIT 1`,
          [user.id],
        );

        const userRole = roles.rows[0]?.role_name || "staff";

        // Check if user_id column exists in payout_requests table
        let hasUserIdColumn = false;
        let tableExists = false;
        try {
          // First check if table exists
          const tableCheck = await app.pg.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'payout_requests'
          `);
          tableExists = tableCheck.rows.length > 0;

          if (tableExists) {
            // Then check if user_id column exists
            const columnCheck = await app.pg.query(`
              SELECT column_name 
              FROM information_schema.columns 
              WHERE table_schema = 'public' 
              AND table_name = 'payout_requests' 
              AND column_name = 'user_id'
            `);
            hasUserIdColumn = columnCheck.rows.length > 0;
          }
        } catch (error) {
          request.log.warn({ err: error }, "Failed to check for user_id column or table");
          // If check fails, assume column doesn't exist
          hasUserIdColumn = false;
          tableExists = false;
        }

        // Query to get payout requests
        // If user is admin, manager, or auditor, show all requests
        // Otherwise, show only their own requests
        let query;
        let queryParams;

        if (hasUserIdColumn) {
          // Migration has been run - use user_id column
          if (userRole === "admin" || userRole === "managers" || userRole === "auditor") {
            // Show all payout requests (including those without user_id for backward compatibility)
            query = `
              SELECT 
                pr.id,
                pr.amount,
                pr.status,
                pr.created_at,
                pr.processed_at,
                pr.utr,
                pr.remarks,
                u.email as user_email,
                ud.first_name,
                ud.last_name,
                CASE 
                  WHEN u.id IS NOT NULL THEN (
                    SELECT r.name
                    FROM public.user_roles ur_sub
                    JOIN public.roles r ON ur_sub.role_id = r.id
                    WHERE ur_sub.user_id = u.id
                    LIMIT 1
                  )
                  ELSE NULL
                END as user_role
              FROM public.payout_requests pr
              LEFT JOIN public.users u ON pr.user_id = u.id
              LEFT JOIN public.user_details ud ON u.id = ud.user_id
              ORDER BY pr.created_at DESC
            `;
            queryParams = [];
          } else {
            // Show only user's own payout requests
            query = `
              SELECT 
                pr.id,
                pr.amount,
                pr.status,
                pr.created_at,
                pr.processed_at,
                pr.utr,
                pr.remarks,
                u.email as user_email,
                ud.first_name,
                ud.last_name,
                CASE 
                  WHEN u.id IS NOT NULL THEN (
                    SELECT r.name
                    FROM public.user_roles ur_sub
                    JOIN public.roles r ON ur_sub.role_id = r.id
                    WHERE ur_sub.user_id = u.id
                    LIMIT 1
                  )
                  ELSE NULL
                END as user_role
              FROM public.payout_requests pr
              LEFT JOIN public.users u ON pr.user_id = u.id
              LEFT JOIN public.user_details ud ON u.id = ud.user_id
              WHERE pr.user_id = $1
              ORDER BY pr.created_at DESC
            `;
            queryParams = [user.id];
          }
        } else {
          // Migration hasn't been run - return empty results
          if (tableExists) {
            request.log.warn("user_id column doesn't exist in payout_requests table. Please run migration 008_add_user_id_to_payout_requests.sql");
          }
          // Return empty result set
          query = `
            SELECT 
              pr.id,
              pr.amount,
              pr.status,
              pr.created_at,
              NULL::timestamptz as processed_at,
              pr.utr,
              pr.remarks,
              NULL::text as user_email,
              NULL::text as first_name,
              NULL::text as last_name,
              NULL::text as user_role
            FROM public.payout_requests pr
            WHERE 1 = 0
          `;
          queryParams = [];
        }

        let result;
        try {
          result = await app.pg.query(query, queryParams);
        } catch (queryError) {
          request.log.error({ 
            err: queryError, 
            message: queryError.message,
            code: queryError.code,
            detail: queryError.detail,
            query: query.substring(0, 200), // Log first 200 chars of query
            queryParams 
          }, "Query execution failed");
          // Re-throw the error so it's caught by the outer try-catch and returned to client
          throw queryError;
        }

        // Calculate summaries
        const totalAmount = result.rows.reduce((sum, row) => sum + parseFloat(row.amount || 0), 0);
        const approvedAmount = result.rows
          .filter((row) => row.status === "approved")
          .reduce((sum, row) => sum + parseFloat(row.amount || 0), 0);
        const rejectedAmount = result.rows
          .filter((row) => row.status === "rejected")
          .reduce((sum, row) => sum + parseFloat(row.amount || 0), 0);
        const pendingAmount = result.rows
          .filter((row) => row.status === "pending")
          .reduce((sum, row) => sum + parseFloat(row.amount || 0), 0);

        // Format payout requests
        const payoutRequests = result.rows.map((row) => {
          // Format wallet name from user role
          let walletName = "Wallet";
          if (row.user_role) {
            const roleName = row.user_role.charAt(0).toUpperCase() + row.user_role.slice(1).replace(/_/g, " ");
            walletName = `${roleName} Wallet`;
          } else {
            // Fallback to user name or email
            const userName = row.first_name
              ? `${row.first_name}${row.last_name ? ` ${row.last_name}` : ""}`
              : row.user_email?.split("@")[0] || "User";
            walletName = `${userName} Wallet`;
          }

          // Format status
          let statusDisplay = "Pending Approval";
          if (row.status === "approved") {
            statusDisplay = "Approved";
          } else if (row.status === "rejected") {
            statusDisplay = "Rejected";
          }

          return {
            id: row.id,
            reference: generateReference(row.id, row.created_at),
            wallet: walletName,
            amount: formatAmount(parseFloat(row.amount || 0)),
            amountValue: parseFloat(row.amount || 0),
            status: statusDisplay,
            statusValue: row.status,
            clearedOn: row.processed_at ? formatDate(row.processed_at) : "--",
            clearedOnValue: row.processed_at,
            createdAt: row.created_at,
            utr: row.utr,
            remarks: row.remarks,
          };
        });

        reply.send({
          summaries: {
            totalAmount: formatAmount(totalAmount),
            totalAmountValue: totalAmount,
            approvedAmount: formatAmount(approvedAmount),
            approvedAmountValue: approvedAmount,
            rejectedAmount: formatAmount(rejectedAmount),
            rejectedAmountValue: rejectedAmount,
            pendingAmount: formatAmount(pendingAmount),
            pendingAmountValue: pendingAmount,
          },
          payoutRequests,
        });
      } catch (error) {
        request.log.error({ err: error, message: error.message, stack: error.stack }, "Failed to fetch payout requests");
        reply.code(500).send({ 
          message: "Failed to fetch payout requests",
          error: error.message || "Unknown error",
          details: process.env.NODE_ENV === "development" ? error.stack : undefined
        });
      }
    },
  );
}

module.exports = payoutRequestRoutes;

