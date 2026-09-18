function requiredEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

export const config = {
  port: parseInt(process.env.PORT ?? "3001", 10),
  databaseUrl: requiredEnv("DATABASE_URL"),
  jwtSecret: requiredEnv("JWT_SECRET"),
};

if (config.jwtSecret.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters (openssl rand -hex 32)");
}
