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
    console.log('=== STEP 1: Add price columns to products ===');
    await qr.query(`ALTER TABLE products ADD COLUMN cost decimal(10,2) NOT NULL DEFAULT 0`);
    await qr.query(`ALTER TABLE products ADD COLUMN price decimal(10,2) NOT NULL DEFAULT 0`);
    await qr.query(`ALTER TABLE products ADD COLUMN sale_price decimal(10,2) DEFAULT NULL`);
    console.log('  Added cost, price, sale_price columns');

    console.log('=== STEP 2: Migrate price data ===');
    const priceResult = await qr.query(`
      UPDATE products p
      SET cost = ppg.cost, price = ppg.price, sale_price = ppg.sale_price
      FROM product_price_groups ppg
      WHERE ppg.product_id = p.id
    `);
    console.log('  Migrated prices for', priceResult[1], 'products');

    // Verify
    const priceCheck = await qr.query(`SELECT COUNT(*) as cnt FROM products WHERE price = 0 AND cost = 0`);
    console.log('  Products with both price=0 and cost=0:', priceCheck[0].cnt);

    console.log('=== STEP 3: Add weight/dimension columns to products ===');
    await qr.query(`ALTER TABLE products ADD COLUMN weight decimal(10,2) DEFAULT NULL`);
    await qr.query(`ALTER TABLE products ADD COLUMN length decimal(10,2) DEFAULT NULL`);
    await qr.query(`ALTER TABLE products ADD COLUMN width decimal(10,2) DEFAULT NULL`);
    await qr.query(`ALTER TABLE products ADD COLUMN height decimal(10,2) DEFAULT NULL`);
    console.log('  Added weight, length, width, height columns');

    console.log('=== STEP 4: Migrate weight data ===');
    const weightResult = await qr.query(`
      UPDATE products p
      SET weight = pwg.weight, length = pwg.length, width = pwg.width, height = pwg.height
      FROM product_weight_groups pwg
      WHERE pwg.product_id = p.id
    `);
    console.log('  Migrated weights for', weightResult[1], 'products');

    console.log('=== STEP 5: Add stock columns to products ===');
    await qr.query(`ALTER TABLE products ADD COLUMN quantity int NOT NULL DEFAULT 0`);
    await qr.query(`ALTER TABLE products ADD COLUMN low_stock_threshold int NOT NULL DEFAULT 10`);
    await qr.query(`ALTER TABLE products ADD COLUMN is_out_of_stock boolean NOT NULL DEFAULT true`);
    console.log('  Added quantity, low_stock_threshold, is_out_of_stock columns');

    console.log('=== STEP 6: Migrate stock data ===');
    const stockResult = await qr.query(`
      UPDATE products p
      SET quantity = ps.quantity,
          low_stock_threshold = ps.low_stock_threshold,
          is_out_of_stock = ps.is_out_of_stock
      FROM product_stock ps
      WHERE ps.product_id = p.id
    `);
    console.log('  Migrated stock for', stockResult[1], 'products');

    // The 6 products with no stock keep defaults: quantity=0, low_stock_threshold=10, is_out_of_stock=true

    console.log('=== STEP 7: Flatten media (remove group references) ===');
    const mediaResult = await qr.query(`UPDATE media SET media_group_id = NULL, is_group_primary = false`);
    console.log('  Cleared media group data for', mediaResult[1], 'media rows');

    console.log('=== STEP 8: Drop dependent tables (junction tables first) ===');
    await qr.query(`DROP TABLE IF EXISTS product_variant_combinations CASCADE`);
    console.log('  Dropped product_variant_combinations');

    await qr.query(`DROP TABLE IF EXISTS product_price_group_values CASCADE`);
    console.log('  Dropped product_price_group_values');

    await qr.query(`DROP TABLE IF EXISTS product_weight_group_values CASCADE`);
    console.log('  Dropped product_weight_group_values');

    await qr.query(`DROP TABLE IF EXISTS product_media_group_values CASCADE`);
    console.log('  Dropped product_media_group_values');

    console.log('=== STEP 9: Drop parent tables ===');
    await qr.query(`DROP TABLE IF EXISTS product_stock CASCADE`);
    console.log('  Dropped product_stock');

    await qr.query(`DROP TABLE IF EXISTS product_variants CASCADE`);
    console.log('  Dropped product_variants');

    await qr.query(`DROP TABLE IF EXISTS product_price_groups CASCADE`);
    console.log('  Dropped product_price_groups');

    await qr.query(`DROP TABLE IF EXISTS product_weight_groups CASCADE`);
    console.log('  Dropped product_weight_groups');

    console.log('=== STEP 10: Drop media group columns from media ===');
    await qr.query(`ALTER TABLE media DROP COLUMN IF EXISTS media_group_id`);
    await qr.query(`ALTER TABLE media DROP COLUMN IF EXISTS is_group_primary`);
    console.log('  Dropped media_group_id and is_group_primary from media');

    await qr.query(`DROP TABLE IF EXISTS product_media_groups CASCADE`);
    console.log('  Dropped product_media_groups');

    console.log('=== STEP 11: Final verification ===');
    const finalProducts = await qr.query(`SELECT COUNT(*) as cnt FROM products`);
    console.log('  Total products:', finalProducts[0].cnt);

    const sampleFinal = await qr.query(`
      SELECT id, name_en, cost, price, sale_price, weight, quantity, low_stock_threshold, is_out_of_stock
      FROM products 
      ORDER BY id
      LIMIT 5
    `);
    console.log('  Sample products:', sampleFinal);

    // Check no orphan tables remain
    const tables = await qr.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN (
        'product_variants', 'product_variant_combinations',
        'product_price_groups', 'product_price_group_values',
        'product_weight_groups', 'product_weight_group_values',
        'product_media_groups', 'product_media_group_values',
        'product_stock'
      )
    `);
    console.log('  Remaining dropped tables (should be 0):', tables.length, tables);

    // Check media columns are gone
    const mediaCols = await qr.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'media' AND column_name IN ('media_group_id', 'is_group_primary')
    `);
    console.log('  Remaining media group columns (should be 0):', mediaCols.length, mediaCols);

    await qr.commitTransaction();
    console.log('\n=== ALL CHANGES COMMITTED SUCCESSFULLY ===');
  } catch (e) {
    await qr.rollbackTransaction();
    console.error('\n=== ROLLED BACK ===');
    console.error(e.message);
    console.error(e.stack);
  } finally {
    await qr.release();
    await ds.destroy();
  }
})();
