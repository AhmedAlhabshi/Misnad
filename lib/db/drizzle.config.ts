import { defineConfig } from "drizzle-kit";

// drizzle-kit resolves `schema` as a glob pattern, and its glob matcher treats
// backslashes as escape characters, not path separators. An absolute Windows
// path built with `path.join(__dirname, ...)` therefore silently matches zero
// files here ("No schema files found") even though the file exists — a plain
// forward-slash-relative path (resolved by drizzle-kit relative to this
// config file's own directory) is the correct, portable form.
const SCHEMA_PATH = "./src/schema/index.ts";

const databaseUrl = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DIRECT_DATABASE_URL or DATABASE_URL must be set, ensure the database is provisioned",
  );
}

export default defineConfig({
  schema: SCHEMA_PATH,
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
