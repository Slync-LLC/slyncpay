import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import bcrypt from "bcrypt";
import { env } from "./lib/env.js";
import { ApiError } from "./lib/errors.js";
import { authRoutes } from "./routes/auth.js";
import { tenantRoutes } from "./routes/tenant.js";
import { entityRoutes } from "./routes/entities.js";
import { contractorRoutes } from "./routes/contractors.js";
import { payableRoutes } from "./routes/payables.js";
import { disbursementRoutes } from "./routes/disbursements.js";
import { adminRoutes } from "./routes/admin.js";
import { startTenantSetupWorker } from "./workers/tenant-setup.worker.js";
import { startEntitySetupWorker } from "./workers/entity-setup.worker.js";
import { db, admins, eq, runMigrations } from "@slyncpay/db";

const app = new Hono();

// ─── Global middleware ────────────────────────────────────────────────────────

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: process.env["ALLOWED_ORIGINS"]?.split(",") ?? ["http://localhost:3000"],
    credentials: true,
  }),
);

// ─── Routes ───────────────────────────────────────────────────────────────────

app.route("/v1/auth", authRoutes);
app.route("/v1/tenant", tenantRoutes);
app.route("/v1/entities", entityRoutes);
app.route("/v1/contractors", contractorRoutes);
app.route("/v1/payables", payableRoutes);
app.route("/v1/disbursements", disbursementRoutes);
app.route("/v1/admin", adminRoutes);

app.get("/health", (c) => c.json({ status: "ok", version: "1.0.0" }));

// ─── Error handling ───────────────────────────────────────────────────────────

app.onError((err, c) => {
  // Log only message + name in production; stack only in dev. Never log auth headers/body.
  if (process.env["NODE_ENV"] === "production") {
    console.error(`[error] ${(err as Error).name}: ${(err as Error).message} on ${c.req.method} ${c.req.path}`);
  } else {
    console.error(err);
  }

  if (err instanceof ApiError) {
    return c.json(
      { error: err.error, message: err.message, statusCode: err.statusCode },
      err.statusCode as Parameters<typeof c.json>[1],
    );
  }

  if (err instanceof ZodError) {
    return c.json(
      {
        error: "validation_error",
        message: "Request validation failed",
        details: err.flatten().fieldErrors,
        statusCode: 422,
      },
      422,
    );
  }

  if (err instanceof HTTPException) {
    return c.json({ error: "http_error", message: err.message, statusCode: err.status }, err.status);
  }

  return c.json({ error: "internal_server_error", message: "An unexpected error occurred", statusCode: 500 }, 500);
});

// ─── Boot sequence ────────────────────────────────────────────────────────────

async function seedAdmin() {
  const email = process.env["ADMIN_SEED_EMAIL"];
  const password = process.env["ADMIN_SEED_PASSWORD"];
  if (!email || !password) return;

  const existing = await db.select({ id: admins.id }).from(admins).where(eq(admins.email, email)).limit(1);
  if (existing.length > 0) return;

  const passwordHash = await bcrypt.hash(password, 12);
  await db.insert(admins).values({ email, passwordHash, name: "Admin" });
  console.log("[seed] Admin account created for", email);
}

async function boot() {
  await runMigrations();
  await seedAdmin();

  const tenantWorker = startTenantSetupWorker();
  const entityWorker = startEntitySetupWorker();

  tenantWorker.on("failed", (job, err) => {
    console.error(`[TenantSetup] Job ${job?.id} failed:`, err.message);
  });

  entityWorker.on("failed", (job, err) => {
    console.error(`[EntitySetup] Job ${job?.id} failed:`, err.message);
  });

  serve({ fetch: app.fetch, port: env.PORT }, () => {
    console.log(`SlyncPay API running on port ${env.PORT}`);
  });
}

boot().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
