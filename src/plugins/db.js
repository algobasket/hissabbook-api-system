const fp = require("fastify-plugin");
const { Pool } = require("pg");

async function dbPlugin(fastifyInstance) {
  const { DATABASE_URL } = process.env;

  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
  });

  fastifyInstance.decorate("pg", pool);

  fastifyInstance.addHook("onClose", async () => {
    await pool.end();
  });
}

module.exports = fp(dbPlugin);








