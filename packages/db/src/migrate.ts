import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import path from "path";

export async function runMigrations(): Promise<void> {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is required");
  }
  const migrationClient = postgres(connectionString, { max: 1 });
  const db = drizzle(migrationClient);
  try {
    await migrate(db, {
      migrationsFolder: path.join(__dirname, "../migrations"),
    });
    console.log("Migrations complete");
  } finally {
    await migrationClient.end();
  }
}

// Allow running as a standalone script
if (require.main === module) {
  runMigrations().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
