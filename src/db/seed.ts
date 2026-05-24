import { prisma } from "./client";
import { nanoid } from "nanoid";

async function main() {
  const key = "srai_" + nanoid(32);
  const apiKey = await prisma.apiKey.create({
    data: {
      key,
      name: "Development Key",
    },
  });
  console.log("Dev API key:", apiKey.key);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
