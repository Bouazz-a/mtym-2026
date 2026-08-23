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
};
