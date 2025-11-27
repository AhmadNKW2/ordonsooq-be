const { DataSource } = require('typeorm');

// Use the same connection as your app
const dataSource = new DataSource({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  username: 'postgres',
  password: '1953',
  database: 'ordonsooq',
});

async function dropTables() {
  await dataSource.initialize();
  console.log('Connected to database');
  
  const queryRunner = dataSource.createQueryRunner();
  
  // Drop all tables EXCEPT: users, attributes, attribute_values, categories, vendors
  const dropQueries = `
    -- Drop junction/value tables first
    DROP TABLE IF EXISTS product_variant_pricing_values CASCADE;
    DROP TABLE IF EXISTS product_variant_weight_values CASCADE;
    DROP TABLE IF EXISTS product_variant_media_values CASCADE;
    DROP TABLE IF EXISTS product_variant_stock_values CASCADE;
    
    -- Drop old variant tables
    DROP TABLE IF EXISTS product_variant_pricing CASCADE;
    DROP TABLE IF EXISTS product_variant_weight CASCADE;
    DROP TABLE IF EXISTS product_variant_media CASCADE;
    DROP TABLE IF EXISTS product_variant_stock CASCADE;
    
    -- Drop new unified tables
    DROP TABLE IF EXISTS product_variant_combinations CASCADE;
    DROP TABLE IF EXISTS product_stock CASCADE;
    DROP TABLE IF EXISTS product_pricing CASCADE;
    DROP TABLE IF EXISTS product_weight CASCADE;
    DROP TABLE IF EXISTS product_media CASCADE;
    DROP TABLE IF EXISTS product_variants CASCADE;
    DROP TABLE IF EXISTS product_attributes CASCADE;
    DROP TABLE IF EXISTS product_media_group_values CASCADE;
    DROP TABLE IF EXISTS product_media_groups CASCADE;
    DROP TABLE IF EXISTS product_price_groups CASCADE;
    DROP TABLE IF EXISTS product_price_group_values CASCADE;
    DROP TABLE IF EXISTS product_weight_group_values CASCADE;
    DROP TABLE IF EXISTS product_weight_groups CASCADE;
    
    -- Drop related tables
    DROP TABLE IF EXISTS ratings CASCADE;
    DROP TABLE IF EXISTS wishlist_items CASCADE;
    DROP TABLE IF EXISTS wishlists CASCADE;
    DROP TABLE IF EXISTS wallet_transactions CASCADE;
    DROP TABLE IF EXISTS wallets CASCADE;
    DROP TABLE IF EXISTS coupon_usage CASCADE;
    DROP TABLE IF EXISTS coupons CASCADE;
    DROP TABLE IF EXISTS password_reset_tokens CASCADE;
    
    -- Drop products last (has FK dependencies)
    DROP TABLE IF EXISTS products CASCADE;
    
    -- Drop enum types
    DROP TYPE IF EXISTS product_media_type_enum CASCADE;
    DROP TYPE IF EXISTS product_variant_media_type_enum CASCADE;
    DROP TYPE IF EXISTS products_pricing_type_enum CASCADE;
  `;
  
  await queryRunner.query(dropQueries);
  console.log('Tables dropped successfully! (Kept: users, attributes, attribute_values, categories, vendors)');
  
  await queryRunner.release();
  await dataSource.destroy();
  process.exit(0);
}

dropTables().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
