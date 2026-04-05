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

  // 1. Total products
  const total = await ds.query(`SELECT COUNT(*) as cnt FROM products`);
  console.log('Total products:', total[0].cnt);

  // 2. Any archived left?
  const archived = await ds.query(`SELECT COUNT(*) as cnt FROM products WHERE archived_at IS NOT NULL`);
  console.log('Archived:', archived[0].cnt);

  // 3. Products with variants
  const withVariants = await ds.query(`
    SELECT COUNT(DISTINCT p.id) as cnt 
    FROM products p 
    JOIN product_variants pv ON pv.product_id = p.id
  `);
  console.log('Products with variants:', withVariants[0].cnt);

  // 4. Products with >1 variant
  const multiVariant = await ds.query(`
    SELECT p.id, COUNT(pv.id) as vc 
    FROM products p 
    JOIN product_variants pv ON pv.product_id = p.id 
    GROUP BY p.id HAVING COUNT(pv.id) > 1
  `);
  console.log('Products with >1 variant:', multiVariant.length, multiVariant.slice(0, 5));

  // 5. Products with variant combinations
  const withCombos = await ds.query(`
    SELECT COUNT(DISTINCT pv.product_id) as cnt 
    FROM product_variants pv 
    JOIN product_variant_combinations pvc ON pvc.variant_id = pv.id
  `);
  console.log('Products with variant combinations:', withCombos[0].cnt);

  // 6. Price groups per product
  const priceGroups = await ds.query(`
    SELECT p.id, COUNT(ppg.id) as gc 
    FROM products p 
    LEFT JOIN product_price_groups ppg ON ppg.product_id = p.id 
    GROUP BY p.id
  `);
  const pgCounts = {};
  priceGroups.forEach(r => { pgCounts[r.gc] = (pgCounts[r.gc] || 0) + 1; });
  console.log('Price groups distribution:', pgCounts);

  // 7. Products with >1 price group
  const multiPG = priceGroups.filter(r => +r.gc > 1);
  console.log('Products with >1 price group:', multiPG.length);

  // 8. Stock per product
  const stocks = await ds.query(`
    SELECT p.id, COUNT(ps.id) as sc 
    FROM products p 
    LEFT JOIN product_stock ps ON ps.product_id = p.id 
    GROUP BY p.id
  `);
  const sCounts = {};
  stocks.forEach(r => { sCounts[r.sc] = (sCounts[r.sc] || 0) + 1; });
  console.log('Stock rows distribution:', sCounts);

  // 9. Weight groups per product
  const weightGroups = await ds.query(`
    SELECT p.id, COUNT(pwg.id) as wc 
    FROM products p 
    LEFT JOIN product_weight_groups pwg ON pwg.product_id = p.id 
    GROUP BY p.id
  `);
  const wCounts = {};
  weightGroups.forEach(r => { wCounts[r.wc] = (wCounts[r.wc] || 0) + 1; });
  console.log('Weight groups distribution:', wCounts);

  // 10. Sample prices for 3 products
  const samplePrices = await ds.query(`
    SELECT p.id, ppg.cost, ppg.price, ppg.sale_price 
    FROM products p 
    JOIN product_price_groups ppg ON ppg.product_id = p.id 
    LIMIT 3
  `);
  console.log('Sample prices:', samplePrices);

  // 11. Sample stock for a few products
  const sampleStock = await ds.query(`
    SELECT ps.product_id, ps.variant_id, ps.quantity, ps.reserved_quantity, ps.low_stock_threshold, ps.is_out_of_stock 
    FROM product_stock ps 
    LIMIT 3
  `);
  console.log('Sample stock:', sampleStock);

  await ds.destroy();
})();
