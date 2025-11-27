import { MigrationInterface, QueryRunner } from 'typeorm';

export class SchemaImprovements1732700000000 implements MigrationInterface {
  name = 'SchemaImprovements1732700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ==========================================
    // 🔴 CRITICAL: Add Missing Indexes
    // ==========================================

    // Product-related indexes (frequently queried foreign keys)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_products_category_id" ON "products"("category_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_products_vendor_id" ON "products"("vendor_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_products_is_active" ON "products"("is_active")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_products_sku" ON "products"("sku")
    `);

    // Product attributes indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_product_attributes_product_id" ON "product_attributes"("product_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_product_attributes_attribute_id" ON "product_attributes"("attribute_id")
    `);

    // Product variants indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_product_variants_product_id" ON "product_variants"("product_id")
    `);

    // Product variant combinations indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_product_variant_combinations_variant_id" ON "product_variant_combinations"("variant_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_product_variant_combinations_attribute_value_id" ON "product_variant_combinations"("attribute_value_id")
    `);

    // Attribute values indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_attribute_values_attribute_id" ON "attribute_values"("attribute_id")
    `);

    // Ratings indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_ratings_product_id" ON "ratings"("productId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_ratings_user_id" ON "ratings"("userId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_ratings_status" ON "ratings"("status")
    `);

    // Wishlist indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_wishlist_items_wishlist_id" ON "wishlist_items"("wishlistId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_wishlist_items_product_id" ON "wishlist_items"("productId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_wishlists_user_id" ON "wishlists"("userId")
    `);

    // Coupon indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_coupons_code" ON "coupons"("code")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_coupons_status" ON "coupons"("status")
    `);

    // Wallet indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_wallet_transactions_wallet_id" ON "wallet_transactions"("walletId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_wallets_user_id" ON "wallets"("userId")
    `);

    // Category indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_categories_parent_id" ON "categories"("parentId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_categories_is_active" ON "categories"("isActive")
    `);

    // Product media indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_product_media_product_id" ON "product_media"("product_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_product_media_group_id" ON "product_media"("group_id")
    `);

    // Product stock indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_product_stock_product_id" ON "product_stock"("product_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_product_stock_variant_id" ON "product_stock"("variant_id")
    `);

    // Product price group indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_product_price_groups_product_id" ON "product_price_groups"("product_id")
    `);

    // Product weight group indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_product_weight_groups_product_id" ON "product_weight_groups"("product_id")
    `);

    // Product media group indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_product_media_groups_product_id" ON "product_media_groups"("product_id")
    `);

    // ==========================================
    // 🟠 MEDIUM: Add Missing Unique Constraints
    // ==========================================

    // Unique constraint on product_attributes (product + attribute combination)
    await queryRunner.query(`
      ALTER TABLE "product_attributes" 
      ADD CONSTRAINT "uq_product_attribute" UNIQUE ("product_id", "attribute_id")
    `);

    // Unique constraint on wishlist_items (wishlist + product combination)
    await queryRunner.query(`
      ALTER TABLE "wishlist_items" 
      ADD CONSTRAINT "uq_wishlist_product" UNIQUE ("wishlistId", "productId")
    `);

    // Unique constraint on wishlists (one wishlist per user)
    await queryRunner.query(`
      ALTER TABLE "wishlists" 
      ADD CONSTRAINT "uq_user_wishlist" UNIQUE ("userId")
    `);

    // Unique constraint on product_variant_combinations (variant + attribute_value combination)
    await queryRunner.query(`
      ALTER TABLE "product_variant_combinations" 
      ADD CONSTRAINT "uq_variant_attribute_value" UNIQUE ("variant_id", "attribute_value_id")
    `);

    // Unique constraint on product_stock (product + variant combination for stock management)
    await queryRunner.query(`
      ALTER TABLE "product_stock" 
      ADD CONSTRAINT "uq_product_variant_stock" UNIQUE ("product_id", "variant_id")
    `);

    // Unique constraint on wallets (one wallet per user)
    await queryRunner.query(`
      ALTER TABLE "wallets" 
      ADD CONSTRAINT "uq_user_wallet" UNIQUE ("userId")
    `);

    // ==========================================
    // 🟡 LOW: Update ON DELETE Actions
    // ==========================================

    // Rating -> User: CASCADE delete ratings when user is deleted
    await queryRunner.query(`
      ALTER TABLE "ratings" DROP CONSTRAINT IF EXISTS "FK_ratings_user"
    `);
    await queryRunner.query(`
      ALTER TABLE "ratings" 
      ADD CONSTRAINT "FK_ratings_user" 
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
    `);

    // Rating -> Product: CASCADE delete ratings when product is deleted
    await queryRunner.query(`
      ALTER TABLE "ratings" DROP CONSTRAINT IF EXISTS "FK_ratings_product"
    `);
    await queryRunner.query(`
      ALTER TABLE "ratings" 
      ADD CONSTRAINT "FK_ratings_product" 
      FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE
    `);

    // Wishlist -> User: CASCADE delete wishlist when user is deleted
    await queryRunner.query(`
      ALTER TABLE "wishlists" DROP CONSTRAINT IF EXISTS "FK_wishlists_user"
    `);
    await queryRunner.query(`
      ALTER TABLE "wishlists" 
      ADD CONSTRAINT "FK_wishlists_user" 
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
    `);

    // WishlistItem -> Product: CASCADE delete wishlist items when product is deleted
    await queryRunner.query(`
      ALTER TABLE "wishlist_items" DROP CONSTRAINT IF EXISTS "FK_wishlist_items_product"
    `);
    await queryRunner.query(`
      ALTER TABLE "wishlist_items" 
      ADD CONSTRAINT "FK_wishlist_items_product" 
      FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE
    `);

    // Wallet -> User: CASCADE delete wallet when user is deleted
    await queryRunner.query(`
      ALTER TABLE "wallets" DROP CONSTRAINT IF EXISTS "FK_wallets_user"
    `);
    await queryRunner.query(`
      ALTER TABLE "wallets" 
      ADD CONSTRAINT "FK_wallets_user" 
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
    `);

    // WalletTransaction -> Wallet: CASCADE delete transactions when wallet is deleted
    await queryRunner.query(`
      ALTER TABLE "wallet_transactions" DROP CONSTRAINT IF EXISTS "FK_wallet_transactions_wallet"
    `);
    await queryRunner.query(`
      ALTER TABLE "wallet_transactions" 
      ADD CONSTRAINT "FK_wallet_transactions_wallet" 
      FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE CASCADE
    `);

    // Category self-reference: SET NULL when parent category is deleted
    await queryRunner.query(`
      ALTER TABLE "categories" DROP CONSTRAINT IF EXISTS "FK_categories_parent"
    `);
    await queryRunner.query(`
      ALTER TABLE "categories" 
      ADD CONSTRAINT "FK_categories_parent" 
      FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE SET NULL
    `);

    // PasswordResetToken -> User: CASCADE delete tokens when user is deleted
    await queryRunner.query(`
      ALTER TABLE "password_reset_tokens" DROP CONSTRAINT IF EXISTS "FK_password_reset_tokens_user"
    `);
    await queryRunner.query(`
      ALTER TABLE "password_reset_tokens" 
      ADD CONSTRAINT "FK_password_reset_tokens_user" 
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ==========================================
    // Revert ON DELETE Actions (back to default NO ACTION)
    // ==========================================

    await queryRunner.query(`
      ALTER TABLE "password_reset_tokens" DROP CONSTRAINT IF EXISTS "FK_password_reset_tokens_user"
    `);

    await queryRunner.query(`
      ALTER TABLE "categories" DROP CONSTRAINT IF EXISTS "FK_categories_parent"
    `);

    await queryRunner.query(`
      ALTER TABLE "wallet_transactions" DROP CONSTRAINT IF EXISTS "FK_wallet_transactions_wallet"
    `);

    await queryRunner.query(`
      ALTER TABLE "wallets" DROP CONSTRAINT IF EXISTS "FK_wallets_user"
    `);

    await queryRunner.query(`
      ALTER TABLE "wishlist_items" DROP CONSTRAINT IF EXISTS "FK_wishlist_items_product"
    `);

    await queryRunner.query(`
      ALTER TABLE "wishlists" DROP CONSTRAINT IF EXISTS "FK_wishlists_user"
    `);

    await queryRunner.query(`
      ALTER TABLE "ratings" DROP CONSTRAINT IF EXISTS "FK_ratings_product"
    `);

    await queryRunner.query(`
      ALTER TABLE "ratings" DROP CONSTRAINT IF EXISTS "FK_ratings_user"
    `);

    // ==========================================
    // Remove Unique Constraints
    // ==========================================

    await queryRunner.query(`
      ALTER TABLE "wallets" DROP CONSTRAINT IF EXISTS "uq_user_wallet"
    `);

    await queryRunner.query(`
      ALTER TABLE "product_stock" DROP CONSTRAINT IF EXISTS "uq_product_variant_stock"
    `);

    await queryRunner.query(`
      ALTER TABLE "product_variant_combinations" DROP CONSTRAINT IF EXISTS "uq_variant_attribute_value"
    `);

    await queryRunner.query(`
      ALTER TABLE "wishlists" DROP CONSTRAINT IF EXISTS "uq_user_wishlist"
    `);

    await queryRunner.query(`
      ALTER TABLE "wishlist_items" DROP CONSTRAINT IF EXISTS "uq_wishlist_product"
    `);

    await queryRunner.query(`
      ALTER TABLE "product_attributes" DROP CONSTRAINT IF EXISTS "uq_product_attribute"
    `);

    // ==========================================
    // Remove Indexes
    // ==========================================

    await queryRunner.query(`DROP INDEX IF EXISTS "idx_product_media_groups_product_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_product_weight_groups_product_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_product_price_groups_product_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_product_stock_variant_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_product_stock_product_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_product_media_group_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_product_media_product_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_categories_is_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_categories_parent_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_wallets_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_wallet_transactions_wallet_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_coupons_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_coupons_code"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_wishlists_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_wishlist_items_product_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_wishlist_items_wishlist_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_ratings_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_ratings_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_ratings_product_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_attribute_values_attribute_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_product_variant_combinations_attribute_value_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_product_variant_combinations_variant_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_product_variants_product_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_product_attributes_attribute_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_product_attributes_product_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_products_sku"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_products_is_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_products_vendor_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_products_category_id"`);
  }
}
