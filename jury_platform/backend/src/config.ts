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
    // Path-style URLs (endpoint/bucket/key) by default with a custom
    // endpoint: MinIO needs them and R2/Spaces accept them.
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE
      ? process.env.S3_FORCE_PATH_STYLE === "true"
      : Boolean(process.env.S3_ENDPOINT),
    accessKeyId: requiredEnv("S3_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnv("S3_SECRET_ACCESS_KEY"),
  };
}

// Outgoing email (the teams' convocations). Optional: without it previews
// still work and sending answers 503. MAIL_OUTBOX_DIR writes each email to
// that folder as an .eml file instead of sending it (local use, tests).
function mailConfig() {
  const outboxDir = process.env.MAIL_OUTBOX_DIR || undefined;
  const host = process.env.SMTP_HOST || undefined;
  if (!outboxDir && !host) return undefined;
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  return {
    outboxDir,
    smtp: host
      ? {
          host,
          port,
          secure: port === 465, // SSL from the start on 465; STARTTLS otherwise
          user: requiredEnv("SMTP_USER"),
          password: requiredEnv("SMTP_PASSWORD"),
        }
      : undefined,
    from: {
      address: process.env.SMTP_FROM_ADDRESS || "noreply@mail.mathmaroc.org",
      name: process.env.SMTP_FROM_NAME || "MTYM",
    },
    replyTo: process.env.SMTP_REPLY_TO || "mtym@mathmaroc.org",
  };
}

export const config = {
  port: parseInt(process.env.PORT ?? "3001", 10),
  // Loopback by default: in production Caddy is the only way in (the
  // server's firewall is off, so anything on 0.0.0.0 would be public).
  host: process.env.HOST || "127.0.0.1",
  // Header carrying the visitor's IP when proxies sit in front, e.g.
  // cf-connecting-ip behind Cloudflare. Unset: the socket / X-Forwarded-For.
  clientIpHeader: process.env.CLIENT_IP_HEADER?.trim().toLowerCase() || undefined,
  databaseUrl: requiredEnv("DATABASE_URL"),
  jwtSecret: requiredEnv("JWT_SECRET"),
  s3: s3Config(),
  mail: mailConfig(),
  // The interface's address, for the links in emails (login, « Mot de passe
  // oublié »). Never taken from a request: a forged Host would point a
  // reset link elsewhere.
  appUrl: (process.env.APP_URL || "https://mtym-jury.mathmaroc.org").replace(/\/+$/, ""),
};

if (config.jwtSecret.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters (openssl rand -hex 32)");
}
