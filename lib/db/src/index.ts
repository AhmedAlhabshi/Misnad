import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

/**
 * Lazily constructed so merely *importing* this package (or anything that
 * re-exports from it) never requires `DATABASE_URL` to be set — only
 * actually using `pool`/`db` does. Without this, any consumer that imports
 * this module purely for its schema types, or that injects a different
 * repository implementation and never touches the real database, would
 * crash at module-load time in an environment where Postgres hasn't been
 * provisioned yet.
 */
let cachedPool: InstanceType<typeof Pool> | null = null;
let cachedDb: ReturnType<typeof drizzle> | null = null;

function getPool(): InstanceType<typeof Pool> {
  if (!cachedPool) {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL must be set. Did you forget to provision a database?",
      );
    }
    cachedPool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return cachedPool;
}

function getDb(): ReturnType<typeof drizzle> {
  if (!cachedDb) {
    cachedDb = drizzle(getPool(), { schema });
  }
  return cachedDb;
}

export const pool: InstanceType<typeof Pool> = new Proxy({} as InstanceType<typeof Pool>, {
  get(_target, prop, receiver) {
    return Reflect.get(getPool() as object, prop, receiver);
  },
});

export const db: ReturnType<typeof drizzle> = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb() as object, prop, receiver);
  },
});

export * from "./schema";
