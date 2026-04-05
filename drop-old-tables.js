const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: process.env.DB_HOST || 'ep-rough-frog-ag0qwswb-pooler.c-2.eu-central-1.aws.neon.tech',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USERNAME || 'neondb_owner',
    password: process.env.DB_PASSWORD || 'npg_ge05XjRTkYWF',
    database: process.env.DB_NAME || 'neondb',
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log('Connected to database');

  const tablesToDrop = [
    'product_media_group_values',
    'product_media_groups',
    'product_price_group_values',
    'product_price_groups',
    'product_variant_combinations',
    'product_variants',
    'product_weight_group_values',
    'product_weight_groups',
    'product_stock',
  ];

  for (const table of tablesToDrop) {
    try {
      await client.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
      console.log(`Dropped: ${table}`);
    } catch (err) {
      console.error(`Error dropping ${table}: ${err.message}`);
    }
  }

  // Verify they're gone
  const { rows } = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `);
  console.log('\nRemaining tables:');
  rows.forEach(r => console.log('  ' + r.table_name));

  await client.end();
  console.log('\nDone');
}

main().catch(console.error);
