import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";

// vinext writes its own declarations to Next's generated paths during build.
// Restore them so a staging build can share a checkout with the Next server.
const declarations = ["next-env.d.ts", ".next/types/routes.d.ts"].map((path) => ({
  path,
  original: existsSync(path) ? readFileSync(path) : null,
}));

try {
  const result = spawnSync(process.execPath, ["node_modules/vite/bin/vite.js", "build"], { stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  for (const { path, original } of declarations) {
    if (original === null) rmSync(path, { force: true });
    else writeFileSync(path, original);
  }
}
