import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = bcrypt.hashSync('Password123', 10);

  // 1. Create/Upsert Organization
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

  // 2. Create/Upsert Workspace
  const workspace = await prisma.workspace.upsert({
    where: { id: 'ws_main_001' },
    update: {},
    create: {
      id: 'ws_main_001',
      name: 'FlowSuite Main Workspace',
      organizationId: org.id,
    },
  });

  // 2.5 Create/Upsert WorkspaceSettings
  await prisma.workspaceSettings.upsert({
    where: { workspaceId: workspace.id },
    update: {},
    create: {
      workspaceId: workspace.id,
      timezone: 'Asia/Dhaka',
      countryCode: 'BD',
      defaultLanguage: 'bn',
    },
  });

  // 3. Create/Upsert User
  const user = await prisma.user.upsert({
    where: { email: 'admin@flowsuite.com' },
    update: {
      password: hashedPassword,
    },
    create: {
      id: 'usr_main_001',
      email: 'admin@flowsuite.com',
      password: hashedPassword,
      fullName: 'Demo Admin',
      role: 'ADMIN',
      isSuperAdmin: false,
      organizationId: org.id,
    },
  });

  // 4. Create/Upsert WorkspaceMember
  const memberId = 'mem_main_001';
  await prisma.workspaceMember.upsert({
    where: { id: memberId },
    update: {},
    create: {
      id: memberId,
      workspaceId: workspace.id,
      userId: user.id,
      role: 'ADMIN',
    },
  });

  console.log('Seeded Organization:', org.name);
  console.log('Seeded Workspace:', workspace.name);
  console.log('Seeded User:', user.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
