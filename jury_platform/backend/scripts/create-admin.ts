// Creates an admin account and prints its generated password.
//   npm run create-admin -- <email> <firstName> <lastName>
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { generatePassword, hashPassword } from "../src/utils/passwords";

async function main() {
  const [rawEmail, firstName, lastName] = process.argv.slice(2);
  if (!rawEmail || !firstName || !lastName) {
    console.error("Usage: npm run create-admin -- <email> <firstName> <lastName>");
    process.exit(1);
  }
  const email = rawEmail.trim().toLowerCase();

  const db = new PrismaClient();
  try {
    if (await db.account.findUnique({ where: { email } })) {
      console.error(`An account with email ${email} already exists.`);
      process.exit(1);
    }
    const password = generatePassword();
    await db.account.create({
      data: { email, firstName, lastName, role: "admin", passwordHash: await hashPassword(password) },
    });
    console.log(`Admin created: ${email}`);
    console.log(`Password:      ${password}`);
    console.log("Change it after the first login (PUT /api/auth/password).");
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
