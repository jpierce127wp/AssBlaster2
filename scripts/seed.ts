import pg from 'pg';

const { Pool } = pg;

async function seed(databaseUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    // No seed data needed — assignment_rules table removed.
    // Canonical tasks and evidence are created through the pipeline.
    console.log('Seed complete (no seed data to insert)');
  } finally {
    await pool.end();
  }
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL environment variable required');
  process.exit(1);
}

seed(databaseUrl).catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
