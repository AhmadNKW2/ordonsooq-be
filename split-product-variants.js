const { Client } = require('pg');
require('dotenv').config();

const args = process.argv.slice(2);

const productIdArg = args.find((arg) => arg.startsWith('--product-id='));
const productId = productIdArg
  ? Number(productIdArg.split('=')[1])
  : Number(args[0]);
const processAllMultiVariant = args.includes('--all-multi-variant');
const applyChanges = args.includes('--apply');
const replaceExisting = args.includes('--replace-existing');
const archiveOriginal = args.includes('--archive-original');

if (!processAllMultiVariant && (!Number.isInteger(productId) || productId <= 0)) {
  console.error(
    'Usage: node split-product-variants.js --product-id=<id> [--apply] [--replace-existing] [--archive-original] OR node split-product-variants.js --all-multi-variant [--apply] [--replace-existing] [--archive-original]',
  );
  process.exit(1);
}

const client = new Client({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false },
});

function slugify(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function uniqueNumbers(values) {
  return [
    ...new Set(
      values.map(Number).filter((value) => Number.isInteger(value) && value > 0),
    ),
  ];
}

function uniquePairs(pairs) {
  const seen = new Set();
  const result = [];

  for (const pair of pairs) {
    const key = `${pair.attribute_id}:${pair.attribute_value_id}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(pair);
    }
  }

  return result;
}

function buildVariantSummaries(rows) {
  const variants = new Map();

  for (const row of rows) {
    if (!variants.has(row.variant_id)) {
      variants.set(row.variant_id, {
        id: Number(row.variant_id),
        is_active: row.is_active,
        values: [],
      });
    }

    variants.get(row.variant_id).values.push({
      attribute_id: Number(row.attribute_id),
      attribute_value_id: Number(row.attribute_value_id),
      value_en: row.value_en,
      value_ar: row.value_ar,
    });
  }

  return Array.from(variants.values())
    .map((variant) => ({
      ...variant,
      values: variant.values.sort((left, right) => left.attribute_id - right.attribute_id),
    }))
    .sort((left, right) => left.id - right.id);
}

function buildGroups(baseRows, valueRows, idKey, fields) {
  const groups = new Map();

  for (const row of baseRows) {
    const id = Number(row[idKey]);
    groups.set(id, {
      id,
      pairs: [],
      valueIds: [],
      ...fields.reduce((result, field) => {
        result[field] = row[field];
        return result;
      }, {}),
    });
  }

  for (const row of valueRows) {
    const id = Number(row[idKey]);
    const group = groups.get(id);
    if (!group) {
      continue;
    }

    if (row.attribute_value_id != null) {
      group.pairs.push({
        attribute_id: Number(row.attribute_id),
        attribute_value_id: Number(row.attribute_value_id),
      });
    }
  }

  return Array.from(groups.values()).map((group) => ({
    ...group,
    pairs: uniquePairs(group.pairs),
    valueIds: uniqueNumbers(group.pairs.map((pair) => pair.attribute_value_id)),
  }));
}

function selectBestMatchingGroup(groups, variantValueIds) {
  const variantValueSet = new Set(variantValueIds);

  return (
    groups
      .filter((group) =>
        group.valueIds.every((valueId) => variantValueSet.has(valueId)),
      )
      .sort((left, right) => right.valueIds.length - left.valueIds.length)[0] ||
    null
  );
}

function dedupeMediaRows(rows) {
  const byId = new Map();
  for (const row of rows) {
    byId.set(Number(row.id), row);
  }
  return Array.from(byId.values());
}

function buildClonePlan(productData) {
  return productData.variants.map((variant) => {
    const suffixEn = variant.values.map((value) => value.value_en).join(' - ');
    const suffixAr = variant.values.map((value) => value.value_ar).join(' - ');
    const nameEn = `${productData.product.name_en} - ${suffixEn}`;
    const nameAr = `${productData.product.name_ar} - ${suffixAr}`;
    const slugBase = slugify(nameEn) || `product-${productData.product.id}-${variant.id}`;
    const sku = `${productData.product.sku}-V${variant.id}`;

    return {
      variant,
      name_en: nameEn,
      name_ar: nameAr,
      slug: `${slugBase}-${variant.id}`,
      sku,
    };
  });
}

async function fetchProductData(productIdToSplit) {
  const productResult = await client.query(
    `select
       id,
       name_en,
       slug,
       name_ar,
       sku,
       short_description_en,
       short_description_ar,
       long_description_en,
       long_description_ar,
       reference_link,
       status,
       visible,
       category_id,
       vendor_id,
       brand_id,
       created_by
     from products
     where id = $1`,
    [productIdToSplit],
  );
  const variantsResult = await client.query(
    `select
       pv.id as variant_id,
       pv.is_active,
       av.id as attribute_value_id,
       av.value_en,
       av.value_ar,
       a.id as attribute_id
     from product_variants pv
     join product_variant_combinations pvc on pvc.variant_id = pv.id
     join attribute_values av on av.id = pvc.attribute_value_id
     join attributes a on a.id = av.attribute_id
     where pv.product_id = $1 and pv.is_active = true
     order by pv.id, a.id, av.id`,
    [productIdToSplit],
  );
  const productAttributesResult = await client.query(
    `select attribute_id, controls_pricing, controls_media, controls_weight
     from product_attributes
     where product_id = $1
     order by attribute_id`,
    [productIdToSplit],
  );
  const categoriesResult = await client.query(
    `select category_id from product_categories where product_id = $1 order by category_id`,
    [productIdToSplit],
  );
  const specificationsResult = await client.query(
    `select specification_value_id
     from product_specification_values
     where product_id = $1
     order by specification_value_id`,
    [productIdToSplit],
  );
  const tagsResult = await client.query(
    `select tag_id from product_tags where product_id = $1 order by tag_id`,
    [productIdToSplit],
  );
  const stockResult = await client.query(
    `select
       variant_id,
       quantity,
       reserved_quantity,
       low_stock_threshold,
       is_out_of_stock
     from product_stock
     where product_id = $1 and variant_id is not null`,
    [productIdToSplit],
  );
  const priceGroupsResult = await client.query(
    `select id as price_group_id, cost, price, sale_price
     from product_price_groups
     where product_id = $1
     order by id`,
    [productIdToSplit],
  );
  const priceGroupValuesResult = await client.query(
    `select price_group_id, attribute_id, attribute_value_id
     from product_price_group_values
     where price_group_id in (
       select id from product_price_groups where product_id = $1
     )
     order by price_group_id, attribute_id`,
    [productIdToSplit],
  );
  const weightGroupsResult = await client.query(
    `select id as weight_group_id, weight, length, width, height
     from product_weight_groups
     where product_id = $1
     order by id`,
    [productIdToSplit],
  );
  const weightGroupValuesResult = await client.query(
    `select weight_group_id, attribute_id, attribute_value_id
     from product_weight_group_values
     where weight_group_id in (
       select id from product_weight_groups where product_id = $1
     )
     order by weight_group_id, attribute_id`,
    [productIdToSplit],
  );
  const mediaRowsResult = await client.query(
    `select
       id,
       url,
       type,
       original_name,
       mime_type,
       size,
       alt_text,
       sort_order,
       is_primary,
       is_group_primary,
       media_group_id
     from media
     where product_id = $1
     order by id`,
    [productIdToSplit],
  );
  const mediaGroupValuesResult = await client.query(
    `select media_group_id, attribute_id, attribute_value_id
     from product_media_group_values
     where media_group_id in (
       select id from product_media_groups where product_id = $1
     )
     order by media_group_id, attribute_id`,
    [productIdToSplit],
  );

  if (!productResult.rows[0]) {
    throw new Error(`Product ${productIdToSplit} not found`);
  }

  return {
    product: productResult.rows[0],
    variants: buildVariantSummaries(variantsResult.rows),
    productAttributes: productAttributesResult.rows.map((row) => ({
      attribute_id: Number(row.attribute_id),
      controls_pricing: row.controls_pricing,
      controls_media: row.controls_media,
      controls_weight: row.controls_weight,
    })),
    categoryIds: categoriesResult.rows.map((row) => Number(row.category_id)),
    specificationValueIds: specificationsResult.rows.map((row) => Number(row.specification_value_id)),
    tagIds: tagsResult.rows.map((row) => Number(row.tag_id)),
    stockByVariantId: new Map(
      stockResult.rows.map((row) => [Number(row.variant_id), row]),
    ),
    priceGroups: buildGroups(
      priceGroupsResult.rows,
      priceGroupValuesResult.rows,
      'price_group_id',
      ['cost', 'price', 'sale_price'],
    ),
    weightGroups: buildGroups(
      weightGroupsResult.rows,
      weightGroupValuesResult.rows,
      'weight_group_id',
      ['weight', 'length', 'width', 'height'],
    ),
    mediaGroupMap: new Map(
      buildGroups(
        Array.from(
          new Set(
            mediaRowsResult.rows
              .map((row) => row.media_group_id)
              .filter((groupId) => groupId != null),
          ),
        ).map((media_group_id) => ({ media_group_id })),
        mediaGroupValuesResult.rows,
        'media_group_id',
        [],
      ).map((group) => [group.id, group]),
    ),
    mediaRows: dedupeMediaRows(mediaRowsResult.rows),
  };
}

async function findExistingConflicts(plannedProducts) {
  const skus = plannedProducts.map((item) => item.sku);
  if (!skus.length) {
    return [];
  }

  const result = await client.query(
    `select id, name_en, sku, slug
     from products
     where sku = any($1::text[])
     order by id`,
    [skus],
  );

  return result.rows;
}

async function findAllMultiVariantProductIds() {
  const result = await client.query(
    `select p.id
     from products p
     join product_variants pv on pv.product_id = p.id and pv.is_active = true
     where p.status <> 'archived'
     group by p.id
     having count(*) > 1
     order by p.id`,
  );

  return result.rows.map((row) => Number(row.id));
}

async function tableExists(tableName) {
  const result = await client.query('select to_regclass($1) as table_name', [
    tableName,
  ]);
  return result.rows[0]?.table_name != null;
}

async function deleteExistingProducts(productIds) {
  if (!productIds.length) {
    return;
  }

  await client.query('delete from cart_items where product_id = any($1::int[])', [productIds]);
  if (await tableExists('groups_products')) {
    await client.query('delete from groups_products where product_id = any($1::int[])', [productIds]);
  }
  await client.query('delete from product_tags where product_id = any($1::int[])', [productIds]);
  await client.query('delete from product_specification_values where product_id = any($1::int[])', [productIds]);
  await client.query('delete from product_categories where product_id = any($1::int[])', [productIds]);
  await client.query('delete from product_attributes where product_id = any($1::int[])', [productIds]);
  await client.query('delete from product_stock where product_id = any($1::int[])', [productIds]);
  await client.query(
    `delete from product_variant_combinations
     where variant_id in (
       select id from product_variants where product_id = any($1::int[])
     )`,
    [productIds],
  );
  await client.query('delete from product_variants where product_id = any($1::int[])', [productIds]);
  await client.query(
    `delete from product_price_group_values
     where price_group_id in (
       select id from product_price_groups where product_id = any($1::int[])
     )`,
    [productIds],
  );
  await client.query('delete from product_price_groups where product_id = any($1::int[])', [productIds]);
  await client.query(
    `delete from product_weight_group_values
     where weight_group_id in (
       select id from product_weight_groups where product_id = any($1::int[])
     )`,
    [productIds],
  );
  await client.query('delete from product_weight_groups where product_id = any($1::int[])', [productIds]);
  await client.query('delete from media where product_id = any($1::int[])', [productIds]);
  await client.query(
    `delete from product_media_group_values
     where media_group_id in (
       select id from product_media_groups where product_id = any($1::int[])
     )`,
    [productIds],
  );
  await client.query('delete from product_media_groups where product_id = any($1::int[])', [productIds]);
  await client.query('delete from products where id = any($1::int[])', [productIds]);
  if (await tableExists('groups') && await tableExists('groups_products')) {
    await client.query(
      'delete from groups g where not exists (select 1 from groups_products gp where gp.group_id = g.id)',
    );
  }
}

async function archiveOriginalProduct(productIdToArchive) {
  await client.query(
    `update products
     set status = 'archived', archived_at = now(), archived_by = null, updated_at = now()
     where id = $1 and status <> 'archived'`,
    [productIdToArchive],
  );
}

function pickVariantMediaRows(productData, variantValueIds) {
  const mediaGroups = Array.from(productData.mediaGroupMap.values());
  const matchedGroup = selectBestMatchingGroup(mediaGroups, variantValueIds);
  const matchedGroupId = matchedGroup ? matchedGroup.id : null;
  const selectedRows = productData.mediaRows
    .filter(
      (row) => row.media_group_id == null || row.media_group_id === matchedGroupId,
    )
    .sort((left, right) => {
      if ((left.sort_order ?? 0) !== (right.sort_order ?? 0)) {
        return (left.sort_order ?? 0) - (right.sort_order ?? 0);
      }
      return Number(left.id) - Number(right.id);
    });

  return {
    matchedGroup,
    rows: selectedRows,
  };
}

async function insertClonedProduct(plan, productData) {
  const baseProduct = productData.product;
  const variant = plan.variant;
  const variantValueIds = variant.values.map((value) => value.attribute_value_id);

  const matchedPriceGroup =
    selectBestMatchingGroup(productData.priceGroups, variantValueIds) ||
    productData.priceGroups.find((group) => group.valueIds.length === 0) ||
    null;

  const matchedWeightGroup =
    selectBestMatchingGroup(productData.weightGroups, variantValueIds) ||
    productData.weightGroups.find((group) => group.valueIds.length === 0) ||
    null;

  const stockRow = productData.stockByVariantId.get(variant.id) || null;
  const selectedMedia = pickVariantMediaRows(productData, variantValueIds);
  const selectedMediaRows = selectedMedia.rows;
  const primaryMediaId =
    selectedMediaRows.find((row) => row.is_primary)?.id ||
    selectedMediaRows.find((row) => row.is_group_primary)?.id ||
    selectedMediaRows[0]?.id ||
    null;

  const insertedProductResult = await client.query(
    `insert into products (
       name_en,
       slug,
       name_ar,
       sku,
       short_description_en,
       short_description_ar,
       long_description_en,
       long_description_ar,
       reference_link,
       status,
       visible,
       category_id,
       vendor_id,
       brand_id,
       average_rating,
       total_ratings,
       created_by,
       created_at,
       updated_at
     ) values (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 0, 0, $15, now(), now()
     )
     returning id`,
    [
      plan.name_en,
      plan.slug,
      plan.name_ar,
      plan.sku,
      baseProduct.short_description_en,
      baseProduct.short_description_ar,
      baseProduct.long_description_en,
      baseProduct.long_description_ar,
      baseProduct.reference_link,
      baseProduct.status,
      baseProduct.visible,
      baseProduct.category_id,
      baseProduct.vendor_id,
      baseProduct.brand_id,
      baseProduct.created_by,
    ],
  );

  const newProductId = Number(insertedProductResult.rows[0].id);

  if (productData.categoryIds.length > 0) {
    await client.query(
      `insert into product_categories (product_id, category_id, created_at)
       select $1, category_id, now()
       from unnest($2::int[]) as category_id`,
      [newProductId, productData.categoryIds],
    );
  }

  if (productData.productAttributes.length > 0) {
    for (const attribute of productData.productAttributes) {
      await client.query(
        `insert into product_attributes (
           product_id,
           attribute_id,
           controls_pricing,
           controls_media,
           controls_weight,
           created_at,
           updated_at
         ) values ($1, $2, $3, $4, $5, now(), now())`,
        [
          newProductId,
          attribute.attribute_id,
          attribute.controls_pricing,
          attribute.controls_media,
          attribute.controls_weight,
        ],
      );
    }
  }

  const newVariantResult = await client.query(
    `insert into product_variants (product_id, is_active, created_at, updated_at)
     values ($1, true, now(), now())
     returning id`,
    [newProductId],
  );
  const newVariantId = Number(newVariantResult.rows[0].id);

  for (const value of variant.values) {
    await client.query(
      `insert into product_variant_combinations (variant_id, attribute_value_id, created_at)
       values ($1, $2, now())`,
      [newVariantId, value.attribute_value_id],
    );
  }

  if (stockRow) {
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
       ) values ($1, $2, $3, $4, $5, $6, now(), now())`,
      [
        newProductId,
        newVariantId,
        stockRow.quantity,
        stockRow.reserved_quantity,
        stockRow.low_stock_threshold,
        stockRow.is_out_of_stock,
      ],
    );
  }

  if (matchedPriceGroup) {
    const insertedPriceGroupResult = await client.query(
      `insert into product_price_groups (
         product_id,
         cost,
         price,
         sale_price,
         created_at,
         updated_at
       ) values ($1, $2, $3, $4, now(), now())
       returning id`,
      [
        newProductId,
        matchedPriceGroup.cost,
        matchedPriceGroup.price,
        matchedPriceGroup.sale_price,
      ],
    );
    const newPriceGroupId = Number(insertedPriceGroupResult.rows[0].id);

    for (const pair of matchedPriceGroup.pairs) {
      await client.query(
        `insert into product_price_group_values (
           price_group_id,
           attribute_id,
           attribute_value_id,
           created_at
         ) values ($1, $2, $3, now())`,
        [newPriceGroupId, pair.attribute_id, pair.attribute_value_id],
      );
    }
  }

  if (matchedWeightGroup) {
    const insertedWeightGroupResult = await client.query(
      `insert into product_weight_groups (
         product_id,
         weight,
         length,
         width,
         height,
         created_at,
         updated_at
       ) values ($1, $2, $3, $4, $5, now(), now())
       returning id`,
      [
        newProductId,
        matchedWeightGroup.weight,
        matchedWeightGroup.length,
        matchedWeightGroup.width,
        matchedWeightGroup.height,
      ],
    );
    const newWeightGroupId = Number(insertedWeightGroupResult.rows[0].id);

    for (const pair of matchedWeightGroup.pairs) {
      await client.query(
        `insert into product_weight_group_values (
           weight_group_id,
           attribute_id,
           attribute_value_id,
           created_at
         ) values ($1, $2, $3, now())`,
        [newWeightGroupId, pair.attribute_id, pair.attribute_value_id],
      );
    }
  }

  let newMediaGroupId = null;
  if (selectedMedia.matchedGroup) {
    const insertedMediaGroupResult = await client.query(
      `insert into product_media_groups (product_id, created_at, updated_at)
       values ($1, now(), now())
       returning id`,
      [newProductId],
    );
    newMediaGroupId = Number(insertedMediaGroupResult.rows[0].id);

    for (const pair of selectedMedia.matchedGroup.pairs) {
      await client.query(
        `insert into product_media_group_values (
           media_group_id,
           attribute_id,
           attribute_value_id,
           created_at
         ) values ($1, $2, $3, now())`,
        [newMediaGroupId, pair.attribute_id, pair.attribute_value_id],
      );
    }
  }

  for (const mediaRow of selectedMediaRows) {
    await client.query(
      `insert into media (
         url,
         type,
         original_name,
         mime_type,
         size,
         alt_text,
         product_id,
         media_group_id,
         sort_order,
         is_primary,
         is_group_primary,
         created_at,
         updated_at
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now(), now())`,
      [
        mediaRow.url,
        mediaRow.type,
        mediaRow.original_name,
        mediaRow.mime_type,
        mediaRow.size,
        mediaRow.alt_text,
        newProductId,
        mediaRow.media_group_id == null ? null : newMediaGroupId,
        mediaRow.sort_order,
        primaryMediaId != null && Number(mediaRow.id) === Number(primaryMediaId),
        mediaRow.media_group_id == null ? false : mediaRow.is_group_primary,
      ],
    );
  }

  if (productData.specificationValueIds.length > 0) {
    await client.query(
      `insert into product_specification_values (
         product_id,
         specification_value_id,
         created_at,
         updated_at
       )
       select $1, specification_value_id, now(), now()
       from unnest($2::int[]) as specification_value_id`,
      [newProductId, productData.specificationValueIds],
    );
  }

  if (productData.tagIds.length > 0) {
    await client.query(
      `insert into product_tags (product_id, tag_id)
       select $1, tag_id
       from unnest($2::int[]) as tag_id`,
      [newProductId, productData.tagIds],
    );
  }

  return {
    id: newProductId,
    variant_id: variant.id,
    name_en: plan.name_en,
    name_ar: plan.name_ar,
    sku: plan.sku,
    slug: plan.slug,
    copied_attributes_count: productData.productAttributes.length,
    copied_media_count: selectedMediaRows.length,
    copied_has_variant: true,
    source_attribute_values_en: variant.values.map((value) => value.value_en),
    source_attribute_values_ar: variant.values.map((value) => value.value_ar),
  };
}

async function processOneProduct(productIdToProcess) {
  const productData = await fetchProductData(productIdToProcess);
  if (!productData.variants.length) {
    const activeVariantCountResult = await client.query(
      `select count(*)::int as count
       from product_variants
       where product_id = $1 and is_active = true`,
      [productIdToProcess],
    );
    const activeVariantCount = Number(activeVariantCountResult.rows[0]?.count || 0);

    if (activeVariantCount > 1) {
      throw new Error(
        `Product ${productIdToProcess} has ${activeVariantCount} active variants but no variant combination values`,
      );
    }

    throw new Error(`Product ${productIdToProcess} has no active variants to split`);
  }

  const plannedProducts = buildClonePlan(productData);
  const existingConflicts = await findExistingConflicts(plannedProducts);

  if (!applyChanges) {
    return {
      product_id: productIdToProcess,
      product_name_en: productData.product.name_en,
      original_status: productData.product.status,
      active_variant_count: productData.variants.length,
      archive_original_requested: archiveOriginal,
      existing_conflicts: existingConflicts,
      planned_products: plannedProducts.map((plan) => ({
        variant_id: plan.variant.id,
        new_name_en: plan.name_en,
        new_name_ar: plan.name_ar,
        new_sku: plan.sku,
        new_slug: plan.slug,
      })),
    };
  }

  await client.query('BEGIN');

  try {
    if (existingConflicts.length > 0) {
      if (!replaceExisting) {
        throw new Error(
          `Existing products conflict with the planned SKUs: ${existingConflicts
            .map((product) => product.sku)
            .join(', ')}`,
        );
      }

      await deleteExistingProducts(
        existingConflicts.map((product) => Number(product.id)),
      );
    }

    const createdProducts = [];
    for (const plan of plannedProducts) {
      createdProducts.push(await insertClonedProduct(plan, productData));
    }

    if (archiveOriginal) {
      await archiveOriginalProduct(productIdToProcess);
    }

    await client.query('COMMIT');

    return {
      product_id: productIdToProcess,
      product_name_en: productData.product.name_en,
      original_status_before: productData.product.status,
      original_archived: archiveOriginal,
      replaced_existing_products: existingConflicts.map((product) =>
        Number(product.id),
      ),
      created_count: createdProducts.length,
      created_products: createdProducts,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main() {
  await client.connect();

  try {
    if (processAllMultiVariant) {
      const productIds = await findAllMultiVariantProductIds();

      if (!applyChanges) {
        const previews = [];
        const failures = [];
        for (const currentProductId of productIds) {
          try {
            previews.push(await processOneProduct(currentProductId));
          } catch (error) {
            failures.push({
              product_id: currentProductId,
              error: error.message,
            });
          }
        }

        console.log(
          JSON.stringify(
            {
              dry_run: true,
              candidate_count: productIds.length,
              splittable_count: previews.length,
              unsplittable_count: failures.length,
              archive_original_requested: archiveOriginal,
              replace_existing_supported: true,
              products: previews,
              failures,
            },
            null,
            2,
          ),
        );
        return;
      }

      const successes = [];
      const failures = [];

      for (const currentProductId of productIds) {
        try {
          successes.push(await processOneProduct(currentProductId));
        } catch (error) {
          failures.push({
            product_id: currentProductId,
            error: error.message,
          });
        }
      }

      console.log(
        JSON.stringify(
          {
            candidate_count: productIds.length,
            processed_count: successes.length,
            failed_count: failures.length,
            archive_original_requested: archiveOriginal,
            successes,
            failures,
          },
          null,
          2,
        ),
      );
      return;
    }

    const result = await processOneProduct(productId);
    console.log(
      JSON.stringify(
        applyChanges
          ? result
          : {
              dry_run: true,
              replace_existing_supported: true,
              ...result,
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