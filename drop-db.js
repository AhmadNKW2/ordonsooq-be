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
  
  const dropQueries = `
    DROP TABLE IF EXISTS product_variant_weight CASCADE;
    DROP TABLE IF EXISTS product_variant_stock CASCADE;
    DROP TABLE IF EXISTS product_variant_pricing CASCADE;
    DROP TABLE IF EXISTS product_variant_media CASCADE;
    DROP TABLE IF EXISTS product_weight CASCADE;
    DROP TABLE IF EXISTS product_media CASCADE;
    DROP TABLE IF EXISTS product_pricing CASCADE;
    DROP TABLE IF EXISTS product_attributes CASCADE;
    DROP TABLE IF EXISTS coupon_usage CASCADE;
    DROP TABLE IF EXISTS coupons CASCADE;
    DROP TABLE IF EXISTS wallet_transactions CASCADE;
    DROP TABLE IF EXISTS wallets CASCADE;
    DROP TABLE IF EXISTS ratings CASCADE;
    DROP TABLE IF EXISTS wishlist_items CASCADE;
    DROP TABLE IF EXISTS wishlists CASCADE;
    DROP TABLE IF EXISTS products CASCADE;
    DROP TABLE IF EXISTS attribute_values CASCADE;
    DROP TABLE IF EXISTS attributes CASCADE;
    DROP TABLE IF EXISTS vendors CASCADE;
    DROP TABLE IF EXISTS categories CASCADE;
    DROP TABLE IF EXISTS password_reset_tokens CASCADE;
    DROP TABLE IF EXISTS users CASCADE;
    DROP TYPE IF EXISTS product_media_type_enum CASCADE;
    DROP TYPE IF EXISTS product_variant_media_type_enum CASCADE;
    DROP TYPE IF EXISTS products_pricing_type_enum CASCADE;
  `;
  
  await queryRunner.query(dropQueries);
  console.log('All tables dropped successfully!');
  
  await queryRunner.release();
  await dataSource.destroy();
  process.exit(0);
}

dropTables().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
