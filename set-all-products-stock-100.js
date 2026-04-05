const { Client } = require('pg');
require('dotenv').config();

async function main() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  try {
    await client.connect();
    console.log('Connected to database');

    const result = await client.query(`
      UPDATE products
      SET quantity = 100,
          updated_at = NOW()
    `);

    console.log(`Updated ${result.rowCount ?? 0} products to quantity = 100`);
    console.log(
      'is_out_of_stock was left unchanged for products with quantity > 0 by design.',
    );
  } catch (error) {
    console.error('Failed to update product stock:', error.message);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}

main();