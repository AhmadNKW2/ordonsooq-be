const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken'); // Assumes installed from your dependencies
const dotenv = require('dotenv');

// Load .env manually to assume raw environment
const envPath = path.resolve(__dirname, '.env');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

console.log('\n🔍 --- START DEBUGGING APPLE CONFIG ---');

const teamId = envConfig.APPLE_TEAM_ID;
const keyId = envConfig.APPLE_KEY_ID;
const clientId = envConfig.APPLE_CLIENT_ID;
const rawKey = envConfig.APPLE_PRIVATE_KEY;
const keyLocation = envConfig.APPLE_PRIVATE_KEY_LOCATION;

console.log(`✅  Team ID:   ${teamId}`);
console.log(`✅  Key ID:    ${keyId}`);
console.log(`✅  Client ID: ${clientId}`);

let privateKey = '';

if (rawKey) {
    console.log('found APPLE_PRIVATE_KEY in .env');
    // Simulate the logic in apple.strategy.ts
    // We replace literal string "\n" with actual newlines
    privateKey = rawKey.replace(/\\n/g, '\n');
    
    // Quick validation check
    if (privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
        console.log('✅  Key format looks correct (Headers found)');
    } else {
        console.error('❌  ERROR: Key is missing PEM headers!');
        console.log('   Current start of key:', privateKey.substring(0, 50));
    }
} else if (keyLocation) {
    console.log(`found APPLE_PRIVATE_KEY_LOCATION: ${keyLocation}`);
    try {
        privateKey = fs.readFileSync(keyLocation, 'utf8');
        console.log('✅  Key file read successfully');
    } catch (e) {
        console.error(`❌  ERROR: Could not read key file at ${keyLocation}`);
        console.error(e.message);
    }
} else {
    console.error('❌  ERROR: No Apple Private Key found in .env');
    process.exit(1);
}

// Try to sign a test token
console.log('\n🔐 Testing JWT Signing (Generating Client Secret)...');

try {
    const now = Math.floor(Date.now() / 1000);
    const token = jwt.sign({}, privateKey, {
        algorithm: 'ES256',
        keyid: keyId,
        issuer: teamId,
        audience: 'https://appleid.apple.com',
        subject: clientId,
        expiresIn: 600
    });
    
    console.log('✅  SUCCESS! The Private Key works and can sign tokens.');
    console.log('   Generated Client Secret (truncated):', token.substring(0, 20) + '...');
    console.log('\n--- DIAGNOSIS ---');
    console.log('1. Your Key is Valid.');
    console.log('2. Your Config variables are readable.');
    console.log('3. If login still fails, the issue is likely the CALLBACK URL.');
    console.log(`   Expected Callback URL: ${envConfig.APPLE_CALLBACK_URL}`);
    console.log('   Make sure this EXACT URL is added in your Apple Developer Console -> Identifiers -> Service IDs.');
    
} catch (error) {
    console.error('❌  SIGNING FAILED. Your key is invalid or corrupted.');
    console.error('Error Details:', error.message);
}

console.log('🔍 --- END DEBUG --- \n');
