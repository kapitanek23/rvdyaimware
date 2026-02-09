
const { Client } = require('pg');

// Configuration
// Using Supabase Connection Pooler (IPv4)
const POOLER_HOST = 'aws-0-eu-central-1.pooler.supabase.com'; // Trying EU Central 1 based on user locale
const PROJECT_ID = 'bzfcrejxacssugqlalax';
const USER = `postgres.${PROJECT_ID}`; // Username format for pooler
const PASSWORD = process.env.SUPABASE_DB_PASSWORD || 'SET_PASSWORD_HERE';
const POOLER_PORT = 6543; // Transaction Mode (supports IPv4)
const CONNECTION_STRING = `postgres://${USER}:${PASSWORD}@${POOLER_HOST}:${POOLER_PORT}/postgres?pgbouncer=true`; // Use pgbouncer query param for compatibility

// Helper to try connection with specific region
async function tryConnectAndFix(region) {
    const host = `aws-0-${region}.pooler.supabase.com`;
    console.log(`Attempting connection to region: ${region} (${host})...`);

    // Construct new connection string
    const connStr = `postgres://${USER}:${PASSWORD}@${host}:${POOLER_PORT}/postgres?pgbouncer=true`;

    const client = new Client({
        connectionString: connStr,
        ssl: { rejectUnauthorized: false }, // Required for Supabase
        connectionTimeoutMillis: 5000 // 5 seconds timeout
    });

    try {
        await client.connect();
        console.log(`Connected successfully to ${region}!`);

        // 1. Enable Realtime for player_state
        console.log('Enabling Realtime for table: player_state...');
        try {
            await client.query('ALTER PUBLICATION supabase_realtime ADD TABLE player_state');
            console.log(' - Success: player_state added directly.');
        } catch (err) {
            if (err.code === '42710') { // duplicate_object
                console.log(' - Info: player_state is already in the publication.');
            } else {
                console.error(' - Error adding player_state:', err.message);
            }
        }

        // 2. Enable Realtime for queue
        console.log('Enabling Realtime for table: queue...');
        try {
            await client.query('ALTER PUBLICATION supabase_realtime ADD TABLE queue');
            console.log(' - Success: queue added directly.');
        } catch (err) {
            if (err.code === '42710') { // duplicate_object
                console.log(' - Info: queue is already in the publication.');
            } else {
                console.error(' - Error adding queue:', err.message);
            }
        }

        await client.end();
        return true; // Success

    } catch (err) {
        console.error(`Connection failed for region ${region}.`);
        console.error(`Error details:`, err.message);
        try { await client.end(); } catch (e) { } // Ensure cleanup
        return false; // Failed
    }
}

async function fixRealtime() {
    console.log('Starting Realtime Fix Script (IPv4 Workaround)...');

    // Try likely regions
    const regions = ['eu-central-1', 'eu-west-1', 'us-east-1'];

    for (const region of regions) {
        const success = await tryConnectAndFix(region);
        if (success) {
            console.log('\n--- OPERATION COMPLETED SUCCESSFULLY ---');
            process.exit(0);
        }
    }

    console.error('\n--- ALL ATTEMPTS FAILED ---');
    console.error('Could not connect to any common region. Please verify the Region and Password.');
    process.exit(1);
}

fixRealtime();
