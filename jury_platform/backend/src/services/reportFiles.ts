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

// The main site stores the object key itself in team_reports.fileUrl
// ("reports/<QUAD>/<type>/<file>.pdf"), so it maps straight to the key.
export function signedReportUrl(fileUrl: string): Promise<string> {
  const { client, bucket } = s3();
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: fileUrl.replace(/^\/+/, ""),
      ResponseContentType: "application/pdf",
      ResponseContentDisposition: "inline",
    }),
    { expiresIn: REPORT_URL_TTL },
  );
}
