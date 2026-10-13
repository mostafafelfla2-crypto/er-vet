import { PrismaClient } from "@prisma/client";

/**
 * Prisma client singleton.
 *
 * Targets PostgreSQL (see prisma/schema.prisma). SQLite is not usable inside
 * Vercel serverless functions because it requires a writable file on disk.
 *
 * The `DATABASE_URL` environment variable MUST be set. We fail fast at module
 * load with a clear message rather than letting Prisma raise a cryptic error
 * later inside a request handler.
 */
if (!process.env.DATABASE_URL) {
  throw new Error(
    "[db] DATABASE_URL is not set. Configure a Vercel Postgres (or local " +
      "Postgres) connection string in your environment variables.",
  );
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// In production we only care about errors/warnings; the full query log is
// noisy and leaks SQL into serverless logs.
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "production"
        ? ["error", "warn"]
        : ["query", "error", "warn"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
