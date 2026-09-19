import pg from "pg";
import { startTestDatabase } from "../test/integration/database.js";

// Reproducible synthetic review only. Never reads DATABASE_URL or production data.
const cluster = await startTestDatabase();
const client = new pg.Client({ connectionString: cluster.url });
try {
  await client.connect();
  await client.query("INSERT INTO users (id) SELECT md5(i::text)::uuid FROM generate_series(1,100) i");
  await client.query("INSERT INTO categories (id,name,updated_at) VALUES (md5('category')::uuid,'Synthetic',now())");
  await client.query(`INSERT INTO transactions
    (id,user_id,category_id,total_amount,my_share,recoverable_amount,description,transaction_date,transaction_time,time_zone,updated_at)
    SELECT gen_random_uuid(),md5(((i % 100)+1)::text)::uuid,md5('category')::uuid,100,100,0,'Synthetic',
      DATE '2025-01-01' + ((i / 100) % 365), TIME '12:00:00','Asia/Kolkata',now()
    FROM generate_series(1,100000) i`);
  await client.query("ANALYZE transactions");
  const owner = (await client.query("SELECT md5('1')::uuid AS id")).rows[0].id;
  const cases = [
    ["history-first-page", "SELECT * FROM transactions WHERE user_id=$1 ORDER BY transaction_date DESC, transaction_time DESC,id DESC LIMIT 20"],
    ["history-offset-800", "SELECT * FROM transactions WHERE user_id=$1 ORDER BY transaction_date DESC, transaction_time DESC,id DESC LIMIT 20 OFFSET 800"],
    ["monthly-dashboard", "SELECT expense_nature,category_id,sum(my_share),sum(total_amount),sum(recoverable_amount),count(*) FROM transactions WHERE user_id=$1 AND transaction_date BETWEEN '2025-09-01' AND '2025-09-30' GROUP BY expense_nature,category_id"],
    ["year-analytics", "SELECT transaction_date,expense_nature,category_id,sum(my_share),count(*) FROM transactions WHERE user_id=$1 AND transaction_date BETWEEN '2025-01-01' AND '2025-12-31' GROUP BY transaction_date,expense_nature,category_id"],
  ];
  for (const [name, sql] of cases) {
    const plan = (await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`, [owner])).rows[0]["QUERY PLAN"][0];
    console.log(JSON.stringify({ name, syntheticTransactions: 100000, users: 100, plan }));
  }
} finally { await client.end(); await cluster.stop(); }
