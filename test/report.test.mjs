import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("report rejects repository names with more than one path separator", () => {
  const result = spawnSync(
    process.execPath,
    ["dist/report.js", "owner/repo/extra", "v1", "v2"],
    { encoding: "utf8", timeout: 1000 }
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage: release-intel-report/);
});

test("report rejects repository names with invalid characters", () => {
  const result = spawnSync(
    process.execPath,
    ["dist/report.js", "owner name/repo", "v1", "v2"],
    { encoding: "utf8", timeout: 3000 }
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage: release-intel-report/);
});

test("report rejects repository components with invalid characters", () => {
  const result = spawnSync(
    process.execPath,
    ["dist/report.js", "owner/repo name", "v1", "v2"],
    { encoding: "utf8", timeout: 3000 }
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage: release-intel-report/);
});

test("report rejects unexpected positional arguments", () => {
  const result = spawnSync(
    process.execPath,
    ["dist/report.js", "owner/repo", "v1", "v2", "extra"],
    { encoding: "utf8", timeout: 3000 }
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage: release-intel-report/);
});

test("report rejects duplicate json flags", () => {
  const result = spawnSync(
    process.execPath,
    ["dist/report.js", "owner/repo", "v1", "v2", "--json", "--json"],
    { encoding: "utf8", timeout: 3000 }
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage: release-intel-report/);
});

test("report rejects whitespace-only refs", () => {
  const result = spawnSync(
    process.execPath,
    ["dist/report.js", "owner/repo", "   ", "v2"],
    { encoding: "utf8", timeout: 3000 }
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage: release-intel-report/);
});

test("report rejects a from ref with surrounding whitespace", () => {
  const result = spawnSync(
    process.execPath,
    ["dist/report.js", "owner/repo", " v1", "v2"],
    { encoding: "utf8", timeout: 3000 }
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage: release-intel-report/);
});

test("report rejects a to ref with surrounding whitespace", () => {
  const result = spawnSync(
    process.execPath,
    ["dist/report.js", "owner/repo", "v1", "v2 "],
    { encoding: "utf8", timeout: 3000 }
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage: release-intel-report/);
});

test("report rejects refs with Git range syntax", () => {
  const result = spawnSync(
    process.execPath,
    ["dist/report.js", "owner/repo", "v1:v2", "v3"],
    { encoding: "utf8", timeout: 3000 }
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage: release-intel-report/);
});

test("report rejects refs with dot-prefixed path components", () => {
  const env = {
    ...process.env,
    GITHUB_TOKEN: "dot-prefixed-ref-test-token",
    NODE_OPTIONS: [
      process.env.NODE_OPTIONS,
      `--import=${encodeURI("data:text/javascript,globalThis.fetch=async()=>{throw new Error('FETCH_CALLED')}")}`,
    ].filter(Boolean).join(" "),
  };

  const result = spawnSync(
    process.execPath,
    ["dist/report.js", "owner/repo", "release/.hidden", "v2"],
    { encoding: "utf8", timeout: 3000, env }
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage: release-intel-report/);
  assert.doesNotMatch(result.stderr, /FETCH_CALLED/);
});

test("report rejects refs with empty path components", () => {
  const env = {
    ...process.env,
    GITHUB_TOKEN: "empty-ref-component-test-token",
    NODE_OPTIONS: [
      process.env.NODE_OPTIONS,
      `--import=${encodeURI("data:text/javascript,globalThis.fetch=async()=>{throw new Error('FETCH_CALLED')}")}`,
    ].filter(Boolean).join(" "),
  };

  const result = spawnSync(
    process.execPath,
    ["dist/report.js", "owner/repo", "release//candidate", "v2"],
    { encoding: "utf8", timeout: 3000, env }
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage: release-intel-report/);
  assert.doesNotMatch(result.stderr, /FETCH_CALLED/);
});

test("report rejects refs containing whitespace before fetching", () => {
  const env = {
    ...process.env,
    GITHUB_TOKEN: "whitespace-ref-test-token",
    NODE_OPTIONS: [
      process.env.NODE_OPTIONS,
      `--import=${encodeURI("data:text/javascript,globalThis.fetch=async()=>{throw new Error('FETCH_CALLED')}")}`,
    ].filter(Boolean).join(" "),
  };

  const result = spawnSync(
    process.execPath,
    ["dist/report.js", "owner/repo", "release/ candidate", "v2"],
    { encoding: "utf8", timeout: 3000, env }
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage: release-intel-report/);
  assert.doesNotMatch(result.stderr, /FETCH_CALLED/);
});

test("report rejects Git range syntax in the to ref", () => {
  const result = spawnSync(
    process.execPath,
    ["dist/report.js", "owner/repo", "v1", "v2:v3"],
    { encoding: "utf8", timeout: 3000 }
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage: release-intel-report/);
});

test("report rejects two-dot syntax in the from ref", () => {
  const result = spawnSync(
    process.execPath,
    ["dist/report.js", "owner/repo", "v1..v2", "v3"],
    { encoding: "utf8", timeout: 3000 }
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage: release-intel-report/);
});

test("report rejects two-dot syntax in the to ref", () => {
  const result = spawnSync(
    process.execPath,
    ["dist/report.js", "owner/repo", "v1", "v2..v3"],
    { encoding: "utf8", timeout: 3000 }
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage: release-intel-report/);
});

test("report rejects a single-dot ref in either position before fetching", () => {
  const env = {
    ...process.env,
    GITHUB_TOKEN: "single-dot-ref-test-token",
    NODE_OPTIONS: [
      process.env.NODE_OPTIONS,
      `--import=${encodeURI("data:text/javascript,globalThis.fetch=async()=>{throw new Error('FETCH_CALLED')}")}`,
    ].filter(Boolean).join(" "),
  };

  for (const refs of [[".", "v2"], ["v1", "."]]) {
    const result = spawnSync(
      process.execPath,
      ["dist/report.js", "owner/repo", ...refs],
      { encoding: "utf8", timeout: 3000, env }
    );

    assert.equal(result.status, 1, refs.join(" -> "));
    assert.match(result.stderr, /Usage: release-intel-report/, refs.join(" -> "));
    assert.doesNotMatch(result.stderr, /FETCH_CALLED/, refs.join(" -> "));
  }
});

test("report rejects refs ending with a dot before fetching", () => {
  const env = {
    ...process.env,
    GITHUB_TOKEN: "trailing-dot-ref-test-token",
    NODE_OPTIONS: [
      process.env.NODE_OPTIONS,
      `--import=${encodeURI("data:text/javascript,globalThis.fetch=async()=>{throw new Error('FETCH_CALLED')}")}`,
    ].filter(Boolean).join(" "),
  };

  for (const refs of [["v1.", "v2"], ["v1", "v2."]]) {
    const result = spawnSync(
      process.execPath,
      ["dist/report.js", "owner/repo", ...refs],
      { encoding: "utf8", timeout: 3000, env }
    );

    assert.equal(result.status, 1, refs.join(" -> "));
    assert.match(result.stderr, /Usage: release-intel-report/, refs.join(" -> "));
    assert.doesNotMatch(result.stderr, /FETCH_CALLED/, refs.join(" -> "));
  }
});

test("report rejects refs ending with a slash before fetching", () => {
  const env = {
    ...process.env,
    GITHUB_TOKEN: "trailing-slash-ref-test-token",
    NODE_OPTIONS: [
      process.env.NODE_OPTIONS,
      `--import=${encodeURI("data:text/javascript,globalThis.fetch=async()=>{throw new Error('FETCH_CALLED')}")}`,
    ].filter(Boolean).join(" "),
  };

  for (const refs of [["v1/", "v2"], ["v1", "v2/"]]) {
    const result = spawnSync(
      process.execPath,
      ["dist/report.js", "owner/repo", ...refs],
      { encoding: "utf8", timeout: 3000, env }
    );

    assert.equal(result.status, 1, refs.join(" -> "));
    assert.match(result.stderr, /Usage: release-intel-report/, refs.join(" -> "));
    assert.doesNotMatch(result.stderr, /FETCH_CALLED/, refs.join(" -> "));
  }
});

test("report rejects refs containing control characters", () => {
  const result = spawnSync(
    process.execPath,
    ["dist/report.js", "owner/repo", "v1\nbad", "v2"],
    { encoding: "utf8", timeout: 3000 }
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage: release-intel-report/);
});

test("report rejects Git reflog syntax in either ref before fetching", () => {
  const env = {
    ...process.env,
    GITHUB_TOKEN: "reflog-ref-test-token",
    NODE_OPTIONS: [
      process.env.NODE_OPTIONS,
      `--import=${encodeURI("data:text/javascript,globalThis.fetch=async()=>{throw new Error('FETCH_CALLED')}")}`,
    ].filter(Boolean).join(" "),
  };

  for (const refs of [["v1@{", "v2"], ["v1", "v2@{"]]) {
    const result = spawnSync(
      process.execPath,
      ["dist/report.js", "owner/repo", ...refs],
      { encoding: "utf8", timeout: 3000, env }
    );

    assert.equal(result.status, 1, refs.join(" -> "));
    assert.match(result.stderr, /Usage: release-intel-report/, refs.join(" -> "));
    assert.doesNotMatch(result.stderr, /FETCH_CALLED/, refs.join(" -> "));
  }
});

for (const wildcard of ["?", "*"]) {
  test(`report rejects refs containing ${wildcard}`, () => {
    const result = spawnSync(
      process.execPath,
      ["dist/report.js", "owner/repo", `v${wildcard}1`, "v2"],
      {
        encoding: "utf8",
        timeout: 3000,
        env: {
          ...process.env,
          GITHUB_TOKEN: "wildcard-ref-test-token",
          NODE_OPTIONS: [
            process.env.NODE_OPTIONS,
            `--import=data:text/javascript,${encodeURIComponent("globalThis.fetch=async()=>{throw new Error('FETCH_CALLED')}")}`,
          ].filter(Boolean).join(" "),
        },
      }
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage: release-intel-report/);
  });
}

test("report rejects refs containing backslashes", () => {
  const result = spawnSync(
    process.execPath,
    ["dist/report.js", "owner/repo", "v1\\bad", "v2"],
    {
      encoding: "utf8",
      timeout: 3000,
      env: {
        ...process.env,
        GITHUB_TOKEN: "backslash-ref-test-token",
        NODE_OPTIONS: [
          process.env.NODE_OPTIONS,
          `--import=${encodeURI("data:text/javascript,globalThis.fetch=async()=>{throw new Error('FETCH_CALLED')}")}`,
        ].filter(Boolean).join(" "),
      },
    }
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage: release-intel-report/);
  assert.doesNotMatch(result.stderr, /FETCH_CALLED/);
});

for (const operator of ["^", "~"]) {
  test(`report rejects refs containing ${operator}`, () => {
    const result = spawnSync(
      process.execPath,
      ["dist/report.js", "owner/repo", `v1${operator}1`, "v2"],
      {
        encoding: "utf8",
        timeout: 3000,
        env: {
          ...process.env,
          GITHUB_TOKEN: "revision-operator-test-token",
          NODE_OPTIONS: [
            process.env.NODE_OPTIONS,
            `--import=data:text/javascript,${encodeURIComponent("globalThis.fetch=async()=>{throw new Error('FETCH_CALLED')}")}`,
          ].filter(Boolean).join(" "),
        },
      }
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage: release-intel-report/);
    assert.doesNotMatch(result.stderr, /FETCH_CALLED/);
  });
}

test("report rejects open brackets in either ref before fetching", () => {
  const env = {
    ...process.env,
    GITHUB_TOKEN: "bracket-ref-test-token",
    NODE_OPTIONS: [
      process.env.NODE_OPTIONS,
      `--import=data:text/javascript,${encodeURIComponent("globalThis.fetch=async()=>{throw new Error('FETCH_CALLED')}")}`,
    ].filter(Boolean).join(" "),
  };

  for (const refs of [["v[1", "v2"], ["v1", "v[2"]]) {
    const result = spawnSync(
      process.execPath,
      ["dist/report.js", "owner/repo", ...refs],
      { encoding: "utf8", timeout: 3000, env }
    );

    assert.equal(result.status, 1, refs.join(" -> "));
    assert.match(result.stderr, /Usage: release-intel-report/, refs.join(" -> "));
    assert.doesNotMatch(result.stderr, /FETCH_CALLED/, refs.join(" -> "));
  }
});
