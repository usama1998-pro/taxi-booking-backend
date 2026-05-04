import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";
import { getPrismaConfigDatasourceUrl } from "./src/core/database/database-url";

// Later files override earlier ones (typical: `.env` defaults, `.env.production` on server, `.env.local` on dev).
loadEnv({ path: ".env" });
loadEnv({ path: ".env.production", override: true });
loadEnv({ path: ".env.local", override: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: getPrismaConfigDatasourceUrl(),
  },
});
