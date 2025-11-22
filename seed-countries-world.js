const axios = require('axios');
const { DataSource } = require('typeorm');

// Database configuration - update with your credentials
const AppDataSource = new DataSource({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  username: 'postgres',
  password: '1953',
  database: 'visaplus',
  synchronize: false,
  logging: true,
});

async function seedCountriesWorld() {
  try {
    console.log('Initializing database connection...');
    await AppDataSource.initialize();
    console.log('Database connected!');

    console.log('Fetching countries data from API...');
    const response = await axios.get(
      'https://restcountries.com/v3.1/all?fields=name,translations,flags'
    );
    
    const countries = response.data;
    console.log(`Found ${countries.length} countries`);

    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();

    let successCount = 0;
    let errorCount = 0;

    for (const country of countries) {
      try {
        const nameEn = country.name?.common || 'Unknown';
        const nameAr = country.translations?.ara?.common || nameEn;
        const imageUrl = country.flags?.png || '';

        await queryRunner.query(
          `INSERT INTO countries_world (name_en, name_ar, image_url, created_at, updated_at) 
           VALUES ($1, $2, $3, NOW(), NOW())`,
          [nameEn, nameAr, imageUrl]
        );

        successCount++;
        console.log(`✓ Inserted: ${nameEn} (${nameAr})`);
      } catch (error) {
        errorCount++;
        console.error(`✗ Error inserting ${country.name?.common}:`, error.message);
      }
    }

    await queryRunner.release();

    console.log('\n=== Migration Summary ===');
    console.log(`Successfully inserted: ${successCount} countries`);
    console.log(`Failed: ${errorCount} countries`);
    console.log('========================\n');

    await AppDataSource.destroy();
    console.log('Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

seedCountriesWorld();
