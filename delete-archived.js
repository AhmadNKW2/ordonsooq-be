const { DataSource } = require('typeorm');
require('dotenv').config();

const ds = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: +process.env.DB_PORT,
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  await ds.initialize();
  const qr = ds.createQueryRunner();
  await qr.startTransaction();
  try {
    // Step 1: SET NULL order_items referencing archived products
    const setNull = await qr.query(`
      UPDATE order_items 
      SET "productId" = NULL 
      WHERE "productId" IN (SELECT id FROM products WHERE archived_at IS NOT NULL)
    `);
    console.log('order_items SET NULL:', setNull);

    // Step 2: Delete all archived products (cascades handle the rest)
    const del = await qr.query(`DELETE FROM products WHERE archived_at IS NOT NULL`);
    console.log('Archived products deleted:', del);

    // Step 3: Verify count
    const remaining = await qr.query(`SELECT COUNT(*) as cnt FROM products`);
    console.log('Remaining products:', remaining[0].cnt);

    await qr.commitTransaction();
    console.log('COMMITTED');
  } catch (e) {
    await qr.rollbackTransaction();
    console.error('ROLLED BACK:', e.message);
  } finally {
    await qr.release();
    await ds.destroy();
  }
})();
