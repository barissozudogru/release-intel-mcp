import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("report rejects repository names with more than one path separator", () => {
  const result = spawnSync(
    process.execPath,
    ["dist/report.js", "owner/repo/extra", "v1", "v2"],
    { encoding: "utf8", timeout: 3000 }
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage: release-intel-report/);
});
