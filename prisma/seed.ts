import { PrismaClient, RoleType } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const roles: Array<{ name: RoleType; description: string }> = [
    { name: RoleType.BUYER, description: "Qualified buyer searching and acquiring businesses" },
    { name: RoleType.SELLER, description: "Business founder or owner listing an asset for sale" },
    { name: RoleType.ADMIN, description: "Platform administrator managing trust rules and reviews" },
    { name: RoleType.REVIEWER, description: "Compliance reviewer handling verifications and disputes" },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description },
      create: role,
    });
  }

  // Note: Sample businesses and theses for Phase 1+ will always be marked `isSampleData: true`.
  console.log("Seeded canonical Role records.");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
