import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../config";
import { AppError } from "../utils/errors";

export const REPORT_URL_TTL = 10 * 60; // seconds

let client: S3Client | undefined;

function s3() {
  const s3Config = config.s3;
  if (!s3Config) throw new AppError(503, "Le stockage des rapports n'est pas configuré");
  client ??= new S3Client({
    region: s3Config.region,
    endpoint: s3Config.endpoint,
    forcePathStyle: s3Config.forcePathStyle,
    credentials: {
      accessKeyId: s3Config.accessKeyId,
      secretAccessKey: s3Config.secretAccessKey,
    },
  });
  return { client, bucket: s3Config.bucket };
}

const keyOf = (fileUrl: string) => fileUrl.replace(/^\/+/, "");

// A report file itself, e.g. to attach it to an email
export async function reportFile(fileUrl: string): Promise<Buffer> {
  const { client, bucket } = s3();
  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: keyOf(fileUrl) }));
  if (!res.Body) throw new AppError(502, "Rapport introuvable dans le stockage");
  return Buffer.from(await res.Body.transformToByteArray());
}

// A report file's size in bytes, without downloading it: a GET of its first
// byte, whose Content-Range carries the total ("bytes 0-0/276636") — the
// main site's storage refuses HEAD requests.
export async function reportFileSize(fileUrl: string): Promise<number> {
  const { client, bucket } = s3();
  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: keyOf(fileUrl), Range: "bytes=0-0" }));
  await res.Body?.transformToByteArray(); // drain the one byte
  const total = Number(res.ContentRange?.split("/")[1]);
  return Number.isFinite(total) ? total : (res.ContentLength ?? 0);
}

// The main site stores the object key itself in team_reports.fileUrl
// ("reports/<QUAD>/<type>/<file>.pdf"), so it maps straight to the key.
export function signedReportUrl(fileUrl: string): Promise<string> {
  const { client, bucket } = s3();
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: keyOf(fileUrl),
      ResponseContentType: "application/pdf",
      ResponseContentDisposition: "inline",
    }),
    { expiresIn: REPORT_URL_TTL },
  );
}
