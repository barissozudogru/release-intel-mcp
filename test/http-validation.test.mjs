import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

test("HTTP transport rejects a PORT value with trailing text", () => {
  const outputPath = "dist/index.js";
  if (!existsSync(outputPath) || !readFileSync(outputPath, "utf8").includes("PORT must be a whole number")) {
    const build = spawnSync("npm", ["run", "build"], { encoding: "utf8" });
    assert.equal(build.status, 0, build.stderr);
  }

  const result = spawnSync(
    process.execPath,
    ["dist/index.js", "--http"],
    {
      encoding: "utf8",
      timeout: 10000,
      env: { ...process.env, PORT: "34567junk" },
    }
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /PORT must be a whole number between 0 and 65535/);
});
