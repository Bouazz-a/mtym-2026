function requiredEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

// Read-only access to the main site's report bucket. Optional so the
// platform still starts without it — report links then answer 503.
function s3Config() {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) return undefined;
  return {
    bucket,
    region: requiredEnv("S3_REGION"),
    endpoint: process.env.S3_ENDPOINT || undefined, // non-AWS providers (R2, Spaces, MinIO…)
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    accessKeyId: requiredEnv("S3_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnv("S3_SECRET_ACCESS_KEY"),
  };
}

export const config = {
  port: parseInt(process.env.PORT ?? "3001", 10),
  databaseUrl: requiredEnv("DATABASE_URL"),
  jwtSecret: requiredEnv("JWT_SECRET"),
  s3: s3Config(),
};

if (config.jwtSecret.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters (openssl rand -hex 32)");
}
