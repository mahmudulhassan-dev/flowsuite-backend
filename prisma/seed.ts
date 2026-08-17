import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.upsert({
    where: { id: 'org_main_001' },
    update: {},
    create: {
      id: 'org_main_001',
      name: 'FlowSuite Agency Main',
      cnameDomain: 'suite.amanasuite.com',
      plan: 'PRO_AGENCY',
      aiCredits: 10000,
    },
  });

  console.log('Seeded Organization:', org.name);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
