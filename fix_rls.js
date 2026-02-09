const { Client } = require('pg');

const PROJECT_ID = 'bzfcrejxacssugqlalax';
const USER = `postgres.${PROJECT_ID}`;
const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
const regions = ['eu-central-1', 'eu-west-1', 'us-east-1'];

const SQL = `
-- online_users: add nickname column if missing
ALTER TABLE online_users ADD COLUMN IF NOT EXISTS nickname TEXT;

-- online_users: RLS policies
ALTER TABLE online_users ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='online_users' AND policyname='allow_all_select') THEN
    CREATE POLICY allow_all_select ON online_users FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='online_users' AND policyname='allow_all_insert') THEN
    CREATE POLICY allow_all_insert ON online_users FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='online_users' AND policyname='allow_all_update') THEN
    CREATE POLICY allow_all_update ON online_users FOR UPDATE USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='online_users' AND policyname='allow_all_delete') THEN
    CREATE POLICY allow_all_delete ON online_users FOR DELETE USING (true);
  END IF;
END $$;

-- chat_messages: ensure table and RLS
CREATE TABLE IF NOT EXISTS chat_messages (
    id BIGSERIAL PRIMARY KEY,
    author TEXT NOT NULL DEFAULT 'Anon',
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='chat_messages' AND policyname='allow_all_select') THEN
    CREATE POLICY allow_all_select ON chat_messages FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='chat_messages' AND policyname='allow_all_insert') THEN
    CREATE POLICY allow_all_insert ON chat_messages FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- Enable realtime for chat
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
`;

async function run() {
    const attempts = [
        // Pooler transaction mode
        ...regions.map(r => ({ host: `aws-0-${r}.pooler.supabase.com`, port: 6543, user: `postgres.${PROJECT_ID}` })),
        // Pooler session mode
        ...regions.map(r => ({ host: `aws-0-${r}.pooler.supabase.com`, port: 5432, user: `postgres.${PROJECT_ID}` })),
        // Direct connection
        { host: `db.${PROJECT_ID}.supabase.co`, port: 5432, user: 'postgres' },
    ];

    for (const attempt of attempts) {
        const client = new Client({
            host: attempt.host,
            port: attempt.port,
            user: attempt.user,
            password: PASSWORD,
            database: 'postgres',
            ssl: { rejectUnauthorized: false },
            connectionTimeoutMillis: 8000
        });
        try {
            console.log(`Trying ${attempt.user}@${attempt.host}:${attempt.port}...`);
            await client.connect();
            console.log('Connected!');
            await client.query(SQL);
            console.log('All SQL executed successfully!');
            await client.end();
            process.exit(0);
        } catch (e) {
            console.error(`  Failed:`, e.message);
            try { await client.end(); } catch { }
        }
    }
    console.error('All attempts failed.');
    process.exit(1);
}
run();
