import { createPrismaClient } from '@/lib/db/client';
import type { PrismaClient } from '@/generated/prisma/client';

let prisma: PrismaClient | undefined;

export function testPrisma(): PrismaClient {
  prisma ??= createPrismaClient(process.env.DATABASE_URL!, 4);
  return prisma;
}

export async function closeTestPrisma(): Promise<void> {
  await prisma?.$disconnect();
  prisma = undefined;
}

/** Removes all non-reference rows (keeps countries/sectors). */
export async function truncateContent(client: PrismaClient = testPrisma()): Promise<void> {
  await client.$executeRawUnsafe(`
    TRUNCATE "ArticleCountry", "ArticleSector", "Article", "IngestionQuarantine", "IngestionRun",
      "FeedSource", "OutletLabelHistory", "LabelAppeal", "MediaOutlet", "UserPreference",
      "AdminAuditLog", "ClientEventCounter", "NewsEvent", "EventArticle", "TimelineEntry",
      "StoryJourney", "JourneyNode", "EventExclusion" RESTART IDENTITY CASCADE
  `);
}
