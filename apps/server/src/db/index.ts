import { drizzle } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import * as schema from './schema';

const createDrizzle = (conn: Sql) => drizzle(conn, { schema });

export const createDb = (url: string) => {
  const conn = postgres(url);
  const db = createDrizzle(conn);
  return { db, conn };
};
type DbEnv = {
  HYPERDRIVE?: { connectionString: string };
  DATABASE_URL?: string;
};

export const getDatabaseUrl = (env: DbEnv): string => {
  const url = env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL;
  if (!url) {
    throw new Error('Missing database connection string (HYPERDRIVE or DATABASE_URL)');
  }
  return url;
};

export type DB = ReturnType<typeof createDrizzle>;
