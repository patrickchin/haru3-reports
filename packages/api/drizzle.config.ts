import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  // Schema authority lives in supabase/migrations. We only use Drizzle
  // for typed queries — never for migration generation in production.
  verbose: true,
  strict: true,
});
