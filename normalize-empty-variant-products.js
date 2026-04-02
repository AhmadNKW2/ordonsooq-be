const { Client } = require('pg');
require('dotenv').config();

const args = process.argv.slice(2);
const applyChanges = args.includes('--apply');

const productIdsArg = args.find((arg) => arg.startsWith('--product-ids='));
const explicitProductIds = productIdsArg
  ? productIdsArg
      .split('=')[1]
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value) && value > 0)
  : [];

const client = new Client({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false },
});

async function findCandidateProductIds() {
  if (explicitProductIds.length > 0) {
    return explicitProductIds;
  }

  const result = await client.query(
    `select p.id
     from products p
     join product_variants pv on pv.product_id = p.id and pv.is_active = true
     left join product_variant_combinations pvc on pvc.variant_id = pv.id
     where p.status <> 'archived'
     group by p.id
     having count(distinct pv.id) > 1
        and count(distinct pvc.variant_id) = 0
     order by p.id`,
  );

  return result.rows.map((row) => Number(row.id));
}

async function loadProductState(productId) {
  const result = await client.query(
    `with variant_rows as (
       select pv.id, pv.is_active
       from product_variants pv
       where pv.product_id = $1 and pv.is_active = true
     ),
     stock_rows as (
       select id, variant_id, quantity, reserved_quantity, low_stock_threshold, is_out_of_stock
       from product_stock
       where product_id = $1
     ),
     price_rows as (
       select ppg.id
       from product_price_groups ppg
       where ppg.product_id = $1
     ),
     price_value_rows as (
       select ppgv.id
       from product_price_group_values ppgv
       join product_price_groups ppg on ppg.id = ppgv.price_group_id
       where ppg.product_id = $1
     ),
     weight_rows as (
       select pwg.id
       from product_weight_groups pwg
       where pwg.product_id = $1
     ),
     weight_value_rows as (
       select pwgv.id
       from product_weight_group_values pwgv
       join product_weight_groups pwg on pwg.id = pwgv.weight_group_id
       where pwg.product_id = $1
     ),
     media_group_rows as (
       select pmg.id
       from product_media_groups pmg
       where pmg.product_id = $1
     ),
     media_group_value_rows as (
       select pmgv.id
       from product_media_group_values pmgv
       join product_media_groups pmg on pmg.id = pmgv.media_group_id
       where pmg.product_id = $1
     ),
     attribute_rows as (
       select pa.id
       from product_attributes pa
       where pa.product_id = $1
     ),
     variant_combo_rows as (
       select pvc.id
       from product_variant_combinations pvc
       join product_variants pv on pv.id = pvc.variant_id
       where pv.product_id = $1 and pv.is_active = true
     )
     select
       p.id,
       p.name_en,
       p.status,
       coalesce((select count(*) from variant_rows), 0) as active_variant_count,
       coalesce((select count(*) from variant_combo_rows), 0) as active_variant_combination_count,
       coalesce((select count(*) from attribute_rows), 0) as attribute_count,
       coalesce((select count(*) from price_rows), 0) as price_group_count,
       coalesce((select count(*) from price_value_rows), 0) as price_group_value_count,
       coalesce((select count(*) from weight_rows), 0) as weight_group_count,
       coalesce((select count(*) from weight_value_rows), 0) as weight_group_value_count,
       coalesce((select count(*) from media_group_rows), 0) as media_group_count,
       coalesce((select count(*) from media_group_value_rows), 0) as media_group_value_count
     from products p
     where p.id = $1`,
    [productId],
  );

  if (!result.rows[0]) {
    throw new Error(`Product ${productId} not found`);
  }

  const stockRowsResult = await client.query(
    `select id, variant_id, quantity, reserved_quantity, low_stock_threshold, is_out_of_stock
     from product_stock
     where product_id = $1
     order by id`,
    [productId],
  );

  const variantRowsResult = await client.query(
    `select id
     from product_variants
     where product_id = $1
     order by id`,
    [productId],
  );

  return {
    ...result.rows[0],
    variant_ids: variantRowsResult.rows.map((row) => Number(row.id)),
    stock_rows: stockRowsResult.rows.map((row) => ({
      id: Number(row.id),
      variant_id: row.variant_id == null ? null : Number(row.variant_id),
      quantity: Number(row.quantity),
      reserved_quantity: Number(row.reserved_quantity),
      low_stock_threshold: Number(row.low_stock_threshold),
      is_out_of_stock: row.is_out_of_stock,
    })),
  };
}

function buildSimpleStock(stockRows) {
  const quantity = stockRows.reduce((sum, row) => sum + row.quantity, 0);
  const reservedQuantity = stockRows.reduce(
    (sum, row) => sum + row.reserved_quantity,
    0,
  );
  const lowStockThreshold =
    stockRows.length > 0
      ? Math.min(...stockRows.map((row) => row.low_stock_threshold))
      : 10;
  const isOutOfStock = stockRows.every((row) => row.is_out_of_stock);

  return {
    quantity,
    reserved_quantity: reservedQuantity,
    low_stock_threshold: lowStockThreshold,
    is_out_of_stock: isOutOfStock,
  };
}

function validateProductState(state) {
  const errors = [];

  if (state.status === 'archived') {
    errors.push('product is archived');
  }
  if (Number(state.active_variant_count) <= 1) {
    errors.push('product does not have more than one active variant');
  }
  if (Number(state.active_variant_combination_count) !== 0) {
    errors.push('product has variant combinations');
  }
  if (Number(state.attribute_count) !== 0) {
    errors.push('product has product attributes');
  }
  if (Number(state.price_group_value_count) !== 0) {
    errors.push('product has price group values');
  }
  if (Number(state.weight_group_value_count) !== 0) {
    errors.push('product has weight group values');
  }
  if (Number(state.media_group_value_count) !== 0) {
    errors.push('product has media group values');
  }

  return errors;
}

async function normalizeOneProduct(productId) {
  const state = await loadProductState(productId);
  const validationErrors = validateProductState(state);

  if (validationErrors.length > 0) {
    throw new Error(validationErrors.join('; '));
  }

  const simpleStock = buildSimpleStock(state.stock_rows);

  if (!applyChanges) {
    return {
      product_id: Number(state.id),
      product_name_en: state.name_en,
      active_variant_count: Number(state.active_variant_count),
      variant_ids: state.variant_ids,
      simple_stock_plan: simpleStock,
      media_group_count_to_remove: Number(state.media_group_count),
      price_group_count_kept: Number(state.price_group_count),
      weight_group_count_kept: Number(state.weight_group_count),
    };
  }

  await client.query('BEGIN');
  try {
    await client.query(
      `update media
       set media_group_id = null,
           is_group_primary = false,
           updated_at = now()
       where product_id = $1`,
      [productId],
    );

    await client.query(
      `delete from product_media_group_values
       where media_group_id in (
         select id from product_media_groups where product_id = $1
       )`,
      [productId],
    );
    await client.query(
      'delete from product_media_groups where product_id = $1',
      [productId],
    );

    await client.query('delete from product_attributes where product_id = $1', [
      productId,
    ]);

    if (state.variant_ids.length > 0) {
      await client.query(
        'delete from product_variant_combinations where variant_id = any($1::int[])',
        [state.variant_ids],
      );
    }

    await client.query('delete from product_variants where product_id = $1', [
      productId,
    ]);
    await client.query('delete from product_stock where product_id = $1', [
      productId,
    ]);

    await client.query(
      `insert into product_stock (
         product_id,
         variant_id,
         quantity,
         reserved_quantity,
         low_stock_threshold,
         is_out_of_stock,
         created_at,
         updated_at
       ) values ($1, null, $2, $3, $4, $5, now(), now())`,
      [
        productId,
        simpleStock.quantity,
        simpleStock.reserved_quantity,
        simpleStock.low_stock_threshold,
        simpleStock.is_out_of_stock,
      ],
    );

    await client.query('update products set updated_at = now() where id = $1', [
      productId,
    ]);

    await client.query('COMMIT');

    return {
      product_id: Number(state.id),
      product_name_en: state.name_en,
      removed_variant_count: state.variant_ids.length,
      created_simple_stock: simpleStock,
      removed_media_group_count: Number(state.media_group_count),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main() {
  await client.connect();

  try {
    const productIds = await findCandidateProductIds();
    const successes = [];
    const failures = [];

    for (const productId of productIds) {
      try {
        successes.push(await normalizeOneProduct(productId));
      } catch (error) {
        failures.push({ product_id: productId, error: error.message });
      }
    }

    console.log(
      JSON.stringify(
        {
          dry_run: !applyChanges,
          candidate_count: productIds.length,
          processed_count: successes.length,
          failed_count: failures.length,
          successes,
          failures,
        },
        null,
        2,
      ),
    );
  } finally {
    await client.end();
  }
}

main().catch(async (error) => {
  console.error(error);
  try {
    await client.end();
  } catch {
    // ignore close errors
  }
  process.exit(1);
});