const { Client } = require('pg');

async function runMigration() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '1953',
    database: process.env.DB_NAME || 'ordonsooq',
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // ==========================================
    // 🔴 CRITICAL: Add Missing Indexes
    // ==========================================

    console.log('Creating indexes...');

    // Product-related indexes
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_products_category_id" ON "products"("category_id")`);
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_products_vendor_id" ON "products"("vendor_id")`);
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_products_is_active" ON "products"("is_active")`);
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_products_sku" ON "products"("sku")`);

    // Product attributes indexes
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_product_attributes_product_id" ON "product_attributes"("product_id")`);
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_product_attributes_attribute_id" ON "product_attributes"("attribute_id")`);

    // Product variants indexes
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_product_variants_product_id" ON "product_variants"("product_id")`);

    // Product variant combinations indexes
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_product_variant_combinations_variant_id" ON "product_variant_combinations"("variant_id")`);
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_product_variant_combinations_attribute_value_id" ON "product_variant_combinations"("attribute_value_id")`);

    // Attribute values indexes
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_attribute_values_attribute_id" ON "attribute_values"("attribute_id")`);

    // Ratings indexes
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_ratings_product_id" ON "ratings"("productId")`);
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_ratings_user_id" ON "ratings"("userId")`);
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_ratings_status" ON "ratings"("status")`);

    // Wishlist indexes
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_wishlist_items_wishlist_id" ON "wishlist_items"("wishlistId")`);
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_wishlist_items_product_id" ON "wishlist_items"("productId")`);
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_wishlists_user_id" ON "wishlists"("userId")`);

    // Coupon indexes
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_coupons_code" ON "coupons"("code")`);
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_coupons_status" ON "coupons"("status")`);

    // Wallet indexes
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_wallet_transactions_wallet_id" ON "wallet_transactions"("walletId")`);
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_wallets_user_id" ON "wallets"("userId")`);

    // Category indexes
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_categories_parent_id" ON "categories"("parentId")`);
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_categories_is_active" ON "categories"("isActive")`);

    // Product media indexes
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_product_media_product_id" ON "product_media"("product_id")`);
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_product_media_group_id" ON "product_media"("media_group_id")`);

    // Product stock indexes
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_product_stock_product_id" ON "product_stock"("product_id")`);
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_product_stock_variant_id" ON "product_stock"("variant_id")`);

    // Product price group indexes
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_product_price_groups_product_id" ON "product_price_groups"("product_id")`);

    // Product weight group indexes
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_product_weight_groups_product_id" ON "product_weight_groups"("product_id")`);

    // Product media group indexes
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_product_media_groups_product_id" ON "product_media_groups"("product_id")`);

    console.log('✅ Indexes created successfully');

    // ==========================================
    // 🟠 MEDIUM: Add Missing Unique Constraints
    // ==========================================

    console.log('Adding unique constraints...');

    // Check and add unique constraints (with error handling for existing constraints)
    try {
      await client.query(`ALTER TABLE "product_attributes" ADD CONSTRAINT "uq_product_attribute" UNIQUE ("product_id", "attribute_id")`);
      console.log('  Added uq_product_attribute');
    } catch (e) {
      if (e.code === '42710' || e.code === '42P07') console.log('  uq_product_attribute already exists');
      else throw e;
    }

    try {
      await client.query(`ALTER TABLE "wishlist_items" ADD CONSTRAINT "uq_wishlist_product" UNIQUE ("wishlistId", "productId")`);
      console.log('  Added uq_wishlist_product');
    } catch (e) {
      if (e.code === '42710' || e.code === '42P07') console.log('  uq_wishlist_product already exists');
      else throw e;
    }

    try {
      await client.query(`ALTER TABLE "wishlists" ADD CONSTRAINT "uq_user_wishlist" UNIQUE ("userId")`);
      console.log('  Added uq_user_wishlist');
    } catch (e) {
      if (e.code === '42710' || e.code === '42P07') console.log('  uq_user_wishlist already exists');
      else throw e;
    }

    try {
      await client.query(`ALTER TABLE "product_variant_combinations" ADD CONSTRAINT "uq_variant_attribute_value" UNIQUE ("variant_id", "attribute_value_id")`);
      console.log('  Added uq_variant_attribute_value');
    } catch (e) {
      if (e.code === '42710' || e.code === '42P07') console.log('  uq_variant_attribute_value already exists');
      else throw e;
    }

    try {
      await client.query(`ALTER TABLE "product_stock" ADD CONSTRAINT "uq_product_variant_stock" UNIQUE ("product_id", "variant_id")`);
      console.log('  Added uq_product_variant_stock');
    } catch (e) {
      if (e.code === '42710' || e.code === '42P07') console.log('  uq_product_variant_stock already exists');
      else throw e;
    }

    try {
      await client.query(`ALTER TABLE "wallets" ADD CONSTRAINT "uq_user_wallet" UNIQUE ("userId")`);
      console.log('  Added uq_user_wallet');
    } catch (e) {
      if (e.code === '42710' || e.code === '42P07') console.log('  uq_user_wallet already exists');
      else throw e;
    }

    console.log('✅ Unique constraints added successfully');

    // ==========================================
    // 🟡 LOW: Update ON DELETE Actions
    // ==========================================

    console.log('Updating foreign key constraints...');

    // Rating -> User
    await client.query(`ALTER TABLE "ratings" DROP CONSTRAINT IF EXISTS "FK_ratings_user"`);
    await client.query(`ALTER TABLE "ratings" DROP CONSTRAINT IF EXISTS "FK_4d0b0e3a250e408ee1e96eb2540"`);
    await client.query(`ALTER TABLE "ratings" ADD CONSTRAINT "FK_ratings_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE`);

    // Rating -> Product
    await client.query(`ALTER TABLE "ratings" DROP CONSTRAINT IF EXISTS "FK_ratings_product"`);
    await client.query(`ALTER TABLE "ratings" DROP CONSTRAINT IF EXISTS "FK_6a3d2c3e01d7b2e0fb0f29c5b3a"`);
    await client.query(`ALTER TABLE "ratings" ADD CONSTRAINT "FK_ratings_product" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE`);

    // Wishlist -> User
    await client.query(`ALTER TABLE "wishlists" DROP CONSTRAINT IF EXISTS "FK_wishlists_user"`);
    await client.query(`ALTER TABLE "wishlists" DROP CONSTRAINT IF EXISTS "FK_4f3c30555daa6ab0b70a1db772c"`);
    await client.query(`ALTER TABLE "wishlists" ADD CONSTRAINT "FK_wishlists_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE`);

    // WishlistItem -> Product
    await client.query(`ALTER TABLE "wishlist_items" DROP CONSTRAINT IF EXISTS "FK_wishlist_items_product"`);
    await client.query(`ALTER TABLE "wishlist_items" DROP CONSTRAINT IF EXISTS "FK_5d4a5e0e6c1e7c5a5e4d4c3b2a1"`);
    await client.query(`ALTER TABLE "wishlist_items" ADD CONSTRAINT "FK_wishlist_items_product" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE`);

    // Wallet -> User
    await client.query(`ALTER TABLE "wallets" DROP CONSTRAINT IF EXISTS "FK_wallets_user"`);
    await client.query(`ALTER TABLE "wallets" DROP CONSTRAINT IF EXISTS "FK_2ecdb33f23e9a6fc392025c0b97"`);
    await client.query(`ALTER TABLE "wallets" ADD CONSTRAINT "FK_wallets_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE`);

    // WalletTransaction -> Wallet
    await client.query(`ALTER TABLE "wallet_transactions" DROP CONSTRAINT IF EXISTS "FK_wallet_transactions_wallet"`);
    await client.query(`ALTER TABLE "wallet_transactions" DROP CONSTRAINT IF EXISTS "FK_3c8d5e3a250e408ee1e96eb2541"`);
    await client.query(`ALTER TABLE "wallet_transactions" ADD CONSTRAINT "FK_wallet_transactions_wallet" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE CASCADE`);

    // Category self-reference
    await client.query(`ALTER TABLE "categories" DROP CONSTRAINT IF EXISTS "FK_categories_parent"`);
    await client.query(`ALTER TABLE "categories" DROP CONSTRAINT IF EXISTS "FK_9a6f051e66982b5f0318981bcaa"`);
    await client.query(`ALTER TABLE "categories" ADD CONSTRAINT "FK_categories_parent" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE SET NULL`);

    // PasswordResetToken -> User
    await client.query(`ALTER TABLE "password_reset_tokens" DROP CONSTRAINT IF EXISTS "FK_password_reset_tokens_user"`);
    await client.query(`ALTER TABLE "password_reset_tokens" DROP CONSTRAINT IF EXISTS "FK_7b2c4e3a250e408ee1e96eb2542"`);
    await client.query(`ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "FK_password_reset_tokens_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE`);

    console.log('✅ Foreign key constraints updated successfully');

    console.log('\n🎉 Migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    await client.end();
    console.log('Database connection closed');
  }
}

runMigration().catch(console.error);
