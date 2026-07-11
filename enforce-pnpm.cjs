const fs = require("node:fs");

fs.rmSync("package-lock.json", { force: true });
fs.rmSync("yarn.lock", { force: true });

const userAgent = process.env.npm_config_user_agent || "";

if (!userAgent.startsWith("pnpm/")) {
  console.error("Use pnpm instead");
  process.exit(1);
}
