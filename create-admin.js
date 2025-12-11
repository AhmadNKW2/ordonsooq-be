const { Client } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config();

async function createAdmin() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Admin credentials
    const email = 'admin@ordonsooq.com';
    const password = 'Admin@123456';
    const firstName = 'Admin';
    const lastName = 'User';

    // Check if admin already exists
    const checkResult = await client.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (checkResult.rows.length > 0) {
      console.log('Admin user already exists!');
      console.log('Email:', checkResult.rows[0].email);
      console.log('Role:', checkResult.rows[0].role);
      await client.end();
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert admin user
    const result = await client.query(
      `INSERT INTO users ("firstName", "lastName", email, password, role, "isActive", "emailVerified", "createdAt", "updatedAt") 
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW()) 
       RETURNING id, "firstName", "lastName", email, role`,
      [firstName, lastName, email, hashedPassword, 'admin', true, true]
    );

    console.log('\n✅ Admin user created successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('ID:', result.rows[0].id);
    console.log('Name:', result.rows[0].firstName, result.rows[0].lastName);
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('Role:', result.rows[0].role);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n⚠️  Please change the password after first login!\n');

    await client.end();
    console.log('Database connection closed');
  } catch (error) {
    console.error('Error creating admin user:', error.message);
    await client.end();
    process.exit(1);
  }
}

createAdmin();
