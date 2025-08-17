import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../db/schema.js';

let connection: postgres.Sql;
let db: ReturnType<typeof drizzle>;

declare global {
  var __db: ReturnType<typeof drizzle> | undefined;
  var __connection: postgres.Sql | undefined;
}

// In serverless environments, we want to reuse connections
// This prevents "too many connections" errors
function getConnection() {
  if (globalThis.__connection) {
    return globalThis.__connection;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  // Configure postgres connection for serverless
  const client = postgres(connectionString, {
    max: 1, // Limit connections in serverless
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false, // Disable prepared statements for serverless
  });

  globalThis.__connection = client;
  return client;
}

export function getDb() {
  if (globalThis.__db) {
    return globalThis.__db;
  }

  const connection = getConnection();
  const database = drizzle(connection, { schema });
  
  globalThis.__db = database;
  return database;
}

// For backward compatibility
export { getDb as db };
export default getDb();
