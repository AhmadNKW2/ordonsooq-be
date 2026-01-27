const { Client } = require('pg');
require('dotenv').config();

async function slugify(text) {
  return text.toString().toLowerCase()
    .trim()
    .replace(/\s+/g, '-')     // Replace spaces with -
    .replace(/[^\w\-]+/g, '') // Remove all non-word chars
    .replace(/\-\-+/g, '-')   // Replace multiple - with single -
    .replace(/^-+/, '')       // Trim - from start of text
    .replace(/-+$/, '');      // Trim - from end of text
}

async function run() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log('Connected to database');

    await processTable(client, 'products', 'name_en');
    await processTable(client, 'categories', 'name_en');
    await processTable(client, 'brands', 'name_en');
    await processTable(client, 'vendors', 'name_en');

    console.log('Done!');

  } catch (err) {
    console.error('Error running migration:', err);
  } finally {
    await client.end();
  }
}

async function processTable(client, tableName, nameField) {
  console.log(`Processing table: ${tableName}...`);
  // Fetch all items
  const res = await client.query(`SELECT id, ${nameField} FROM ${tableName} ORDER BY id ASC`);
  const items = res.rows;
  console.log(`Found ${items.length} items to update in ${tableName}.`);

  const slugCounts = {}; // Track usage of base slugs

  for (const item of items) {
    if (!item[nameField]) continue;

    const baseSlug = await slugify(item[nameField]);
    let finalSlug = baseSlug;

    if (slugCounts[baseSlug]) {
      // Increment and append
      slugCounts[baseSlug]++;
      finalSlug = `${baseSlug}-${slugCounts[baseSlug]}`;
    } else {
      // First time seeing this slug
      slugCounts[baseSlug] = 1;
      // finalSlug stays as baseSlug
    }

    console.log(`Updating ${tableName} ${item.id}: ${item[nameField]} -> ${finalSlug}`);
    
    await client.query(`UPDATE ${tableName} SET slug = $1 WHERE id = $2`, [finalSlug, item.id]);
  }
}


run();
