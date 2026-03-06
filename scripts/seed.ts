import pg from 'pg';

const { Pool } = pg;

async function seed(databaseUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    // ── Matter Registry ────────────────────────────────────────────
    console.log('Seeding matter registry...');

    const matters = [
      {
        matter_ref: 'Johnson v. Smith',
        display_name: 'Johnson v. Smith',
        client_name: 'Johnson',
        practice_area: 'litigation',
        aliases: ['Johnson', 'Johnson v Smith', 'Johnson case'],
      },
      {
        matter_ref: 'Martinez v. ABC Corp',
        display_name: 'Martinez v. ABC Corp',
        client_name: 'Martinez',
        practice_area: 'litigation',
        aliases: ['Martinez', 'Martinez v ABC Corp', 'Martinez v. ABC', 'ABC Corp case'],
      },
    ];

    for (const m of matters) {
      await pool.query(
        `INSERT INTO matter_registry (matter_ref, display_name, client_name, practice_area, aliases)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (matter_ref) DO UPDATE SET
           display_name = EXCLUDED.display_name,
           client_name = EXCLUDED.client_name,
           practice_area = EXCLUDED.practice_area,
           aliases = EXCLUDED.aliases,
           updated_at = NOW()`,
        [m.matter_ref, m.display_name, m.client_name, m.practice_area, m.aliases],
      );
      console.log(`  ✓ Matter: ${m.matter_ref}`);
    }

    // ── User Registry ──────────────────────────────────────────────
    console.log('Seeding user registry...');

    const users = [
      {
        user_ref: 'sarah.chen',
        display_name: 'Sarah Chen',
        email: 'sarah.chen@firm.example',
        role: 'Associate',
        department: 'Litigation',
        aliases: ['Sarah', 'Chen', 'S. Chen'],
      },
      {
        user_ref: 'david.park',
        display_name: 'David Park',
        email: 'david.park@firm.example',
        role: 'Associate',
        department: 'Litigation',
        aliases: ['David', 'Park', 'D. Park'],
      },
      {
        user_ref: 'attorney.jones',
        display_name: 'Attorney Jones',
        email: 'jones@firm.example',
        role: 'Partner',
        department: 'Litigation',
        aliases: ['Jones', 'Attorney Jones'],
      },
      {
        user_ref: 'mike.rodriguez',
        display_name: 'Mike Rodriguez',
        email: 'mike.rodriguez@firm.example',
        role: 'Paralegal',
        department: 'Litigation',
        aliases: ['Mike', 'Rodriguez', 'M. Rodriguez'],
      },
      {
        user_ref: 'lisa.wong',
        display_name: 'Lisa Wong',
        email: 'lisa.wong@firm.example',
        role: 'Senior Associate',
        department: 'Litigation',
        aliases: ['Lisa', 'Wong', 'L. Wong'],
      },
    ];

    for (const u of users) {
      await pool.query(
        `INSERT INTO user_registry (user_ref, display_name, email, role, department, aliases)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_ref) DO UPDATE SET
           display_name = EXCLUDED.display_name,
           email = EXCLUDED.email,
           role = EXCLUDED.role,
           department = EXCLUDED.department,
           aliases = EXCLUDED.aliases,
           updated_at = NOW()`,
        [u.user_ref, u.display_name, u.email, u.role, u.department, u.aliases],
      );
      console.log(`  ✓ User: ${u.display_name} (${u.user_ref})`);
    }

    // ── Routing Rules ──────────────────────────────────────────────
    console.log('Seeding routing rules...');

    const rules = [
      { practice_area: '*', action_type: 'filing', assignee_role: 'Paralegal', priority: 0 },
      { practice_area: '*', action_type: 'discovery', assignee_role: 'Associate', priority: 0 },
      { practice_area: '*', action_type: 'research', assignee_role: 'Associate', priority: 0 },
      { practice_area: '*', action_type: 'correspondence', assignee_role: 'Paralegal', priority: 0 },
      { practice_area: '*', action_type: 'drafting', assignee_role: 'Associate', priority: 0 },
      { practice_area: 'litigation', action_type: 'deposition', assignee_role: 'Senior Associate', priority: 10 },
    ];

    for (const r of rules) {
      // Use a two-step upsert: try to reactivate an existing rule first, then insert if none exists
      const existing = await pool.query(
        `UPDATE routing_rules SET active = true, updated_at = NOW()
         WHERE practice_area = $1 AND action_type = $2 AND priority = $3
         RETURNING id`,
        [r.practice_area, r.action_type, r.priority],
      );
      if (existing.rowCount === 0) {
        await pool.query(
          `INSERT INTO routing_rules (practice_area, action_type, assignee_user_id, assignee_role, priority)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT DO NOTHING`,
          [r.practice_area, r.action_type, null, r.assignee_role, r.priority],
        );
      }
      console.log(`  ✓ Rule: ${r.practice_area}/${r.action_type} → ${r.assignee_role}`);
    }

    console.log('\nSeed complete!');
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
