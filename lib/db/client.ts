import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';

/**
 * Prisma singleton (Prisma 7 + node-postgres driver adapter).
 * One pool per process; reused across hot reloads in development.
 */
const globalForPrisma = globalThis as unknown as { __frealgoPrisma?: PrismaClient };

export function createPrismaClient(connectionString: string, max = 10): PrismaClient {
  const adapter = new PrismaPg({
    connectionString,
    max,
    // Fail fast instead of piling up requests when the database is unavailable.
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    application_name: process.env.SERVICE_NAME ?? 'frealgo',
  });
  return new PrismaClient({ adapter });
}

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.__frealgoPrisma) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    globalForPrisma.__frealgoPrisma = createPrismaClient(
      url,
      Number(process.env.DATABASE_POOL_MAX ?? 10),
    );
  }
  return globalForPrisma.__frealgoPrisma;
}

export async function disconnectPrisma(): Promise<void> {
  if (globalForPrisma.__frealgoPrisma) {
    await globalForPrisma.__frealgoPrisma.$disconnect();
    globalForPrisma.__frealgoPrisma = undefined;
  }
}
