import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("githubGetPaginated dead code is not present in src or dist", () => {
  const outputPath = "dist/index.js";
  if (!existsSync(outputPath)) {
    const build = spawnSync("npm", ["run", "build"], { encoding: "utf8" });
    assert.equal(build.status, 0, build.stderr);
  }

  const src = readFileSync("src/index.ts", "utf8");
  const dist = readFileSync(outputPath, "utf8");

  assert.equal(src.includes("githubGetPaginated"), false);
  assert.equal(dist.includes("githubGetPaginated"), false);
});
