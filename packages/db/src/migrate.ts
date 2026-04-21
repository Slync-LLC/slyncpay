import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import path from "path";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

const migrationClient = postgres(connectionString, { max: 1 });
const db = drizzle(migrationClient);

async function main() {
  await migrate(db, {
    migrationsFolder: path.join(__dirname, "../migrations"),
  });
  console.log("Migrations complete");
  await migrationClient.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
