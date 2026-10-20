import { defineConfig } from 'prisma/config';

// Prisma 7 does not auto-load .env. Use Node's built-in loader (no dotenv dependency);
// in containers/CI the variables come from the real environment instead.
try {
  process.loadEnvFile('.env');
} catch {
  // .env is optional
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node --import tsx prisma/seed.ts',
  },
  datasource: {
    // `prisma generate` does not need a live database, so a placeholder keeps it working in
    // Docker builds; migrate/seed commands always run with a real DATABASE_URL.
    url:
      process.env.DATABASE_URL ?? 'postgresql://placeholder:placeholder@localhost:5432/placeholder',
  },
});
