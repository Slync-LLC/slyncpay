function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const env = {
  DATABASE_URL: required("DATABASE_URL"),
  REDIS_URL: process.env["REDIS_URL"] ?? "redis://localhost:6379",
  WINGSPAN_ROOT_API_TOKEN: required("WINGSPAN_ROOT_API_TOKEN"),
  WINGSPAN_ROOT_USER_ID: required("WINGSPAN_ROOT_USER_ID"),
  WINGSPAN_BASE_URL: process.env["WINGSPAN_BASE_URL"] ?? "https://api.wingspan.app",
  PORT: parseInt(process.env["PORT"] ?? "3001", 10),
  API_SECRET: process.env["API_SECRET"] ?? "dev-secret",
  EIN_ENCRYPTION_KEY: required("EIN_ENCRYPTION_KEY"),
  JWT_SECRET: required("JWT_SECRET"),
} as const;
