import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      args[key] = val;
    }
  }
  return args;
}

export function validateAdminProvisionInput({ email, password, fullName }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error('Provide a valid admin email via --email or INITIAL_ADMIN_EMAIL.');
  }
  if (!password || String(password).length < 12) {
    throw new Error('Admin password must be at least 12 characters long.');
  }
  const cleanName = String(fullName || 'Orchard Administrator').trim();
  if (cleanName.length < 2) {
    throw new Error('Admin full name must be at least 2 characters.');
  }
  return { normalizedEmail, password: String(password), fullName: cleanName };
}

export async function provisionAdminInPrisma(prisma, input, rounds = 12) {
  const { normalizedEmail, password, fullName } = validateAdminProvisionInput(input);
  const passwordHash = await bcrypt.hash(password, rounds);

  const user = await prisma.user.upsert({
    where: { email: normalizedEmail },
    update: {
      fullName,
      role: 'ADMIN',
      status: 'ACTIVE',
      passwordHash,
      passwordAlgo: 'bcrypt',
      emailVerifiedAt: new Date(),
    },
    create: {
      email: normalizedEmail,
      fullName,
      role: 'ADMIN',
      status: 'ACTIVE',
      passwordHash,
      passwordAlgo: 'bcrypt',
      emailVerifiedAt: new Date(),
      preference: {
        create: {
          preferredRoast: 'raw_sprouted',
          dietaryGoals: ['omega3', 'heart_healthy'],
          excludedAllergens: [],
          emailUpdates: true,
          smsDeliveryAlerts: false,
        },
      },
    },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: user.id,
      actorRole: 'ADMIN',
      action: 'ADMIN_PROVISIONED',
      entityType: 'User',
      entityId: user.id,
      metadata: { email: normalizedEmail },
    },
  });

  return user;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const email = args.email || process.env.INITIAL_ADMIN_EMAIL;
  const password = args.password || process.env.INITIAL_ADMIN_PASSWORD;
  const fullName = args.name || process.env.INITIAL_ADMIN_NAME || 'Orchard Administrator';

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required to provision a MySQL administrator account.');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  provisionAdminInPrisma(prisma, { email, password, fullName })
    .then((user) => {
      console.log(`Administrator provisioned: ${user.email} (${user.id})`);
    })
    .catch((err) => {
      console.error('Admin provisioning failed:', err.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
