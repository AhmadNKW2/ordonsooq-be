const { Client } = require('pg');
require('dotenv').config();

const REVIEW_STATUS = 'review';
const PREVIEW_LIMIT = 20;

function printUsage() {
  console.log(`Usage: node delete-review-products.js [options]

Options:
  --dry-run                 Show matching products without deleting them
  --vendorId=<id>           Delete only review products for one vendor
  --vendor-id=<id>          Same as --vendorId
  --categoryId=<id>         Delete only review products for one category
  --category-id=<id>        Same as --categoryId
  --help, -h                Show this help message

Examples:
  node delete-review-products.js --dry-run
  node delete-review-products.js
  node delete-review-products.js --vendorId=2 --categoryId=35
  pnpm run delete:review-products -- --dry-run`);
}

function parsePositiveInteger(rawValue, optionName) {
  const value = Number(rawValue);

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${optionName} must be a positive integer. Received: ${rawValue}`);
  }

  return value;
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    vendorId: null,
    categoryId: null,
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--') {
      continue;
    }

    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg.startsWith('--vendorId=')) {
      options.vendorId = parsePositiveInteger(
        arg.slice('--vendorId='.length),
        '--vendorId',
      );
      continue;
    }

    if (arg.startsWith('--vendor-id=')) {
      options.vendorId = parsePositiveInteger(
        arg.slice('--vendor-id='.length),
        '--vendor-id',
      );
      continue;
    }

    if (arg.startsWith('--categoryId=')) {
      options.categoryId = parsePositiveInteger(
        arg.slice('--categoryId='.length),
        '--categoryId',
      );
      continue;
    }

    if (arg.startsWith('--category-id=')) {
      options.categoryId = parsePositiveInteger(
        arg.slice('--category-id='.length),
        '--category-id',
      );
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function resolveSslConfig() {
  const rawValue = process.env.DB_SSL?.trim().toLowerCase();

  if (rawValue && ['false', '0', 'off', 'no'].includes(rawValue)) {
    return false;
  }

  return { rejectUnauthorized: false };
}

function createClient() {
  return new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: resolveSslConfig(),
  });
}

function buildProductSelectionQuery(filters) {
  const values = [REVIEW_STATUS];
  const conditions = ['p.status = $1'];

  if (filters.vendorId !== null) {
    values.push(filters.vendorId);
    conditions.push(`p.vendor_id = $${values.length}`);
  }

  if (filters.categoryId !== null) {
    values.push(filters.categoryId);
    const categoryParam = `$${values.length}`;
    conditions.push(`(
      p.category_id = ${categoryParam}
      OR EXISTS (
        SELECT 1
        FROM product_categories pc
        WHERE pc.product_id = p.id
          AND pc.category_id = ${categoryParam}
      )
    )`);
  }

  return {
    text: `
      SELECT p.id, p.name_en, p.sku, p.vendor_id, p.category_id
      FROM products p
      WHERE ${conditions.join('\n        AND ')}
      ORDER BY p.id ASC
    `,
    values,
  };
}

async function findMatchingProducts(client, filters) {
  const query = buildProductSelectionQuery(filters);
  const result = await client.query(query.text, query.values);
  return result.rows;
}

function printSelectionSummary(products, filters) {
  console.log('Review product cleanup');
  console.log('Filters:', {
    status: REVIEW_STATUS,
    vendorId: filters.vendorId,
    categoryId: filters.categoryId,
  });
  console.log('Matched products:', products.length);

  if (!products.length) {
    return;
  }

  const preview = products.slice(0, PREVIEW_LIMIT).map((product) => ({
    id: product.id,
    sku: product.sku,
    name_en: product.name_en,
    vendor_id: product.vendor_id,
    category_id: product.category_id,
  }));

  console.table(preview);

  if (products.length > PREVIEW_LIMIT) {
    console.log(`Preview limited to first ${PREVIEW_LIMIT} rows.`);
  }
}

async function cleanupOrphanedGroups(client, touchedGroupIds) {
  if (!touchedGroupIds.length) {
    return {
      orphanedGroupIds: [],
      groupMembershipsDeleted: 0,
      groupsDeleted: 0,
    };
  }

  const membershipResult = await client.query(
    `
      SELECT group_id, COUNT(*)::int AS membership_count
      FROM groups_products
      WHERE group_id = ANY($1::int[])
      GROUP BY group_id
    `,
    [touchedGroupIds],
  );

  const membershipCountByGroupId = new Map(
    membershipResult.rows.map((row) => [
      Number(row.group_id),
      Number(row.membership_count),
    ]),
  );

  const orphanedGroupIds = touchedGroupIds.filter(
    (groupId) => (membershipCountByGroupId.get(groupId) ?? 0) < 2,
  );

  if (!orphanedGroupIds.length) {
    return {
      orphanedGroupIds: [],
      groupMembershipsDeleted: 0,
      groupsDeleted: 0,
    };
  }

  const membershipsDeleteResult = await client.query(
    'DELETE FROM groups_products WHERE group_id = ANY($1::int[])',
    [orphanedGroupIds],
  );
  const groupsDeleteResult = await client.query(
    'DELETE FROM groups WHERE id = ANY($1::int[])',
    [orphanedGroupIds],
  );

  return {
    orphanedGroupIds,
    groupMembershipsDeleted: membershipsDeleteResult.rowCount,
    groupsDeleted: groupsDeleteResult.rowCount,
  };
}

async function deleteReviewProducts(filters = {}) {
  const client = createClient();

  try {
    await client.connect();

    const normalizedFilters = {
      dryRun: Boolean(filters.dryRun),
      vendorId: filters.vendorId ?? null,
      categoryId: filters.categoryId ?? null,
    };

    const products = await findMatchingProducts(client, normalizedFilters);
    printSelectionSummary(products, normalizedFilters);

    if (normalizedFilters.dryRun || !products.length) {
      return {
        deleted: 0,
        matched: products.length,
        dryRun: normalizedFilters.dryRun,
      };
    }

    const productIds = products.map((product) => Number(product.id));

    await client.query('BEGIN');

    const touchedGroupResult = await client.query(
      'SELECT DISTINCT group_id FROM groups_products WHERE product_id = ANY($1::int[]) ORDER BY group_id ASC',
      [productIds],
    );
    const touchedGroupIds = touchedGroupResult.rows.map((row) =>
      Number(row.group_id),
    );

    const orderItemsUpdated = await client.query(
      'UPDATE order_items SET "productId" = NULL WHERE "productId" = ANY($1::int[])',
      [productIds],
    );
    const cartItemsDeleted = await client.query(
      'DELETE FROM cart_items WHERE product_id = ANY($1::int[])',
      [productIds],
    );
    const wishlistItemsDeleted = await client.query(
      'DELETE FROM wishlists WHERE product_id = ANY($1::int[])',
      [productIds],
    );
    const ratingsDeleted = await client.query(
      'DELETE FROM ratings WHERE product_id = ANY($1::int[])',
      [productIds],
    );
    const notesDeleted = await client.query(
      'DELETE FROM notes WHERE product_id = ANY($1::int[])',
      [productIds],
    );
    const tagLinksDeleted = await client.query(
      'DELETE FROM product_tags WHERE product_id = ANY($1::int[])',
      [productIds],
    );
    const slugRedirectsDeleted = await client.query(
      'DELETE FROM product_slug_redirects WHERE product_id = ANY($1::int[])',
      [productIds],
    );
    const productMediaDeleted = await client.query(
      'DELETE FROM product_media WHERE product_id = ANY($1::int[])',
      [productIds],
    );
    const productCategoryLinksDeleted = await client.query(
      'DELETE FROM product_categories WHERE product_id = ANY($1::int[])',
      [productIds],
    );
    const productAttributesDeleted = await client.query(
      'DELETE FROM product_attributes WHERE product_id = ANY($1::int[])',
      [productIds],
    );
    const productAttributeValuesDeleted = await client.query(
      'DELETE FROM product_attribute_values WHERE product_id = ANY($1::int[])',
      [productIds],
    );
    const productSpecificationValuesDeleted = await client.query(
      'DELETE FROM product_specification_values WHERE product_id = ANY($1::int[])',
      [productIds],
    );
    const groupMembershipsDeleted = await client.query(
      'DELETE FROM groups_products WHERE product_id = ANY($1::int[])',
      [productIds],
    );
    const legacyMediaCleared = await client.query(
      'UPDATE media SET product_id = NULL, sort_order = 0, is_primary = false WHERE product_id = ANY($1::int[])',
      [productIds],
    );
    const productsDeleted = await client.query(
      'DELETE FROM products WHERE id = ANY($1::int[])',
      [productIds],
    );
    const orphanedGroupsCleanup = await cleanupOrphanedGroups(
      client,
      touchedGroupIds,
    );

    await client.query('COMMIT');

    const summary = {
      deletedProducts: productsDeleted.rowCount,
      orderItemsUpdated: orderItemsUpdated.rowCount,
      cartItemsDeleted: cartItemsDeleted.rowCount,
      wishlistItemsDeleted: wishlistItemsDeleted.rowCount,
      ratingsDeleted: ratingsDeleted.rowCount,
      notesDeleted: notesDeleted.rowCount,
      tagLinksDeleted: tagLinksDeleted.rowCount,
      slugRedirectsDeleted: slugRedirectsDeleted.rowCount,
      productMediaDeleted: productMediaDeleted.rowCount,
      productCategoryLinksDeleted: productCategoryLinksDeleted.rowCount,
      productAttributesDeleted: productAttributesDeleted.rowCount,
      productAttributeValuesDeleted: productAttributeValuesDeleted.rowCount,
      productSpecificationValuesDeleted:
        productSpecificationValuesDeleted.rowCount,
      groupMembershipsDeleted: groupMembershipsDeleted.rowCount,
      orphanedGroupMembershipsDeleted:
        orphanedGroupsCleanup.groupMembershipsDeleted,
      orphanedGroupsDeleted: orphanedGroupsCleanup.groupsDeleted,
      legacyMediaCleared: legacyMediaCleared.rowCount,
    };

    console.log('Deletion completed.');
    console.table(summary);

    if (orphanedGroupsCleanup.orphanedGroupIds.length) {
      console.log(
        'Removed orphaned groups:',
        orphanedGroupsCleanup.orphanedGroupIds.join(', '),
      );
    }

    return summary;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Ignore rollback failures after a connection-level error.
    }

    throw error;
  } finally {
    await client.end();
  }
}

async function runCli() {
  try {
    const options = parseArgs(process.argv.slice(2));

    if (options.help) {
      printUsage();
      return;
    }

    await deleteReviewProducts(options);
  } catch (error) {
    console.error('Delete review products failed:', error.message);
    printUsage();
    process.exitCode = 1;
  }
}

module.exports = {
  deleteReviewProducts,
  parseArgs,
};

if (require.main === module) {
  runCli();
}