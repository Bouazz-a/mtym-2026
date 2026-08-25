function require(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

export const config = {
  port: parseInt(process.env.PORT ?? "3001", 10),
  databaseUrl: require("DATABASE_URL"),
  authentikIssuer: require("AUTHENTIK_ISSUER"),
  authentikAudience: require("AUTHENTIK_AUDIENCE"),
  uploadsDir: process.env.UPLOADS_DIR ?? "./uploads",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  // Dev-only login stub (sign in as any seeded user, no password) — stands
  // in for real auth until that's decided. Off unless explicitly enabled.
  enableDevLogin: process.env.ENABLE_DEV_LOGIN === "true",
  devLoginSecret: process.env.DEV_LOGIN_SECRET,
};

if (config.enableDevLogin && !config.devLoginSecret) {
  throw new Error("ENABLE_DEV_LOGIN is true but DEV_LOGIN_SECRET is not set");
}
