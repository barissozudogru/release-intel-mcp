import { test } from "node:test";
import assert from "node:assert/strict";

import {
  extractLinkedIssues,
  summarizeBody,
  categorizePRByLabels,
  calculateFileStats,
  formatStat,
  renderMarkdown,
} from "../dist/logic.js";

test("extractLinkedIssues returns an empty array for null or empty bodies", () => {
  assert.deepEqual(extractLinkedIssues(null), []);
  assert.deepEqual(extractLinkedIssues(""), []);
});

test("extractLinkedIssues picks up close/fix/resolve keywords", () => {
  assert.deepEqual(extractLinkedIssues("closes #123"), [123]);
  assert.deepEqual(extractLinkedIssues("Fixes #456 and resolves #789"), [456, 789]);
  assert.deepEqual(extractLinkedIssues("CLOSES #5"), [5]);
  assert.deepEqual(extractLinkedIssues("fixes: #99"), [99]);
  assert.deepEqual(extractLinkedIssues("Resolves: #100"), [100]);
});

test("extractLinkedIssues collects grouped references after one closing keyword", () => {
  assert.deepEqual(extractLinkedIssues("Closes #12, #34 and owner/repository#56"), [12, 34, 56]);
});

test("extractLinkedIssues collects grouped references with an Oxford comma", () => {
  assert.deepEqual(extractLinkedIssues("Closes #12, #34, and #56"), [12, 34, 56]);
});

test("extractLinkedIssues follows full issue and PR URLs", () => {
  assert.deepEqual(
    extractLinkedIssues("resolves https://github.com/owner/repo/issues/42"),
    [42]
  );
  assert.deepEqual(
    extractLinkedIssues("closes https://github.com/owner/repo/pull/123"),
    [123]
  );
});

test("extractLinkedIssues follows cross-repository issue references", () => {
  assert.deepEqual(extractLinkedIssues("Fixes owner/repository#123"), [123]);
});

test("extractLinkedIssues deduplicates repeated references", () => {
  assert.deepEqual(extractLinkedIssues("closes #1 and also fixes #1"), [1]);
});

test("extractLinkedIssues ignores bare #numbers without a closing keyword", () => {
  // Regression guard for the old overly broad /#(\d+)/g pattern.
  assert.deepEqual(extractLinkedIssues("see #100 for context"), []);
});

test("extractLinkedIssues ignores issue-like numbers embedded in words", () => {
  assert.deepEqual(extractLinkedIssues("fixes #123abc and resolves owner/repo#45-beta"), []);
});

test("extractLinkedIssues ignores issue-like numbers embedded in Unicode words", () => {
  assert.deepEqual(extractLinkedIssues("fixes #123éclair and resolves owner/repo#45東京"), []);
});

test("extractLinkedIssues ignores issue numbers outside the safe integer range", () => {
  assert.deepEqual(extractLinkedIssues(`closes #${"9".repeat(400)}`), []);
});

test("extractLinkedIssues ignores closing keywords embedded in words", () => {
  assert.deepEqual(extractLinkedIssues("prefixes #123 and unfixes #456"), []);
});

test("categorizePRByLabels maps common GitHub labels", () => {
  assert.equal(categorizePRByLabels(["breaking"]), "breaking");
  assert.equal(categorizePRByLabels(["breaking-change"]), "breaking");
  assert.equal(categorizePRByLabels(["breaking change"]), "breaking");
  assert.equal(categorizePRByLabels(["enhancement"]), "feature");
  assert.equal(categorizePRByLabels(["bug"]), "fix");
  assert.equal(categorizePRByLabels(["fixed"]), "fix");
  assert.equal(categorizePRByLabels(["documentation"]), "docs");
  assert.equal(categorizePRByLabels(["dependencies"]), "dependencies");
  assert.equal(categorizePRByLabels(["chore"]), "chore");
});

test("categorizePRByLabels ignores surrounding label whitespace", () => {
  assert.equal(categorizePRByLabels([" breaking change "]), "breaking");
  assert.equal(categorizePRByLabels(["  bug  "]), "fix");
});

test("categorizePRByLabels avoids false positives from substrings", () => {
  assert.equal(categorizePRByLabels(["suffix"]), "other");
  assert.equal(categorizePRByLabels(["defeat"]), "other");
  assert.equal(categorizePRByLabels(["docker"]), "other");
  assert.equal(categorizePRByLabels(["deploy"]), "other");
  assert.equal(categorizePRByLabels(["breaking-other"]), "other");
  assert.equal(categorizePRByLabels(["not breaking"]), "other");
  assert.equal(categorizePRByLabels(["non-breaking"]), "other");
});

test("categorizePRByLabels ignores explicitly negated category labels", () => {
  assert.equal(categorizePRByLabels(["not-a-bug"]), "other");
  assert.equal(categorizePRByLabels(["not-a-feature"]), "other");
  assert.equal(categorizePRByLabels(["not-docs"]), "other");
});

test("categorizePRByLabels falls back to conventional commit prefixes", () => {
  assert.equal(categorizePRByLabels([], "feat: add login"), "feature");
  assert.equal(categorizePRByLabels([], "fix: null crash"), "fix");
  assert.equal(categorizePRByLabels([], "docs: update readme"), "docs");
  assert.equal(categorizePRByLabels([], "chore: tidy scripts"), "chore");
  assert.equal(categorizePRByLabels([], "deps: bump zod"), "dependencies");
  assert.equal(categorizePRByLabels([], "feat!: drop legacy api"), "breaking");
  assert.equal(categorizePRByLabels([], "feat(auth)!: remove old login"), "breaking");
});

test("categorizePRByLabels returns other when nothing matches", () => {
  assert.equal(categorizePRByLabels([], "random commit message"), "other");
  assert.equal(categorizePRByLabels(["good first issue"], "no prefix here"), "other");
});

test("summarizeBody returns an empty string for null or empty input", () => {
  assert.equal(summarizeBody(null), "");
  assert.equal(summarizeBody(""), "");
});

test("summarizeBody passes short bodies through untouched", () => {
  assert.equal(summarizeBody("short body"), "short body");
});

test("summarizeBody truncates long bodies with an ellipsis", () => {
  const result = summarizeBody("a".repeat(400));
  assert.equal(result.length, 303);
  assert.ok(result.endsWith("..."));
});

test("summarizeBody never exceeds a small custom maximum", () => {
  for (const [body, maxLength, expected] of [["abcdef", 2, "ab"], ["a".repeat(30), 4, "a..."], ["a".repeat(30), 10, "aaaaaaa..."]]) {
    const result = summarizeBody(body, maxLength);
    assert.equal(result, expected);
    assert.ok(result.length <= maxLength);
  }
});

test("summarizeBody does not split surrogate pairs while truncating", () => {
  const result = summarizeBody("😀😀😀", 4);
  assert.equal(result, "...");
  assert.doesNotMatch(result, /[\uD800-\uDFFF]/);
});

test("summarizeBody uses the default limit for a NaN maximum", () => {
  assert.equal(summarizeBody("a".repeat(400), Number.NaN), `${"a".repeat(300)}...`);
});

test("summarizeBody uses the default limit for a negative maximum", () => {
  assert.equal(summarizeBody("a".repeat(400), -1), `${"a".repeat(300)}...`);
});

test("summarizeBody preserves the custom result length for an explicit null maximum", () => {
  assert.equal(summarizeBody("a".repeat(400), null), `${"a".repeat(297)}...`);
});

test("summarizeBody strips HTML comments and normalizes line endings", () => {
  const result = summarizeBody("hello <!-- secret --> world\r\nsecond");
  assert.ok(!result.includes("secret"));
  assert.ok(result.includes("hello"));
  assert.ok(result.includes("world"));
  assert.ok(result.includes("\n"));
  assert.ok(!result.includes("\r"));
});

test("summarizeBody normalizes lone carriage returns", () => {
  assert.equal(summarizeBody("first\rsecond"), "first\nsecond");
});

test("release PRs are categorized as releases, not fixes", () => {
  // PR "release: 0.122.0" with label "autorelease: tagged" was reported as a
  // bug fix by get_release_summary and as "other" by get_pull_requests_in_range.
  assert.equal(
    categorizePRByLabels(["autorelease: tagged"], "release: 0.122.0"),
    "release"
  );
  assert.equal(categorizePRByLabels([], "release: 1.4.0"), "release");
  assert.equal(categorizePRByLabels([], "chore(release): 1.4.0"), "release");
  assert.equal(categorizePRByLabels(["release-please"], "anything"), "release");
});

test("ordinary PRs are unaffected by the release rule", () => {
  assert.equal(categorizePRByLabels([], "fix: handle empty input"), "fix");
  assert.equal(categorizePRByLabels([], "feat: add retry"), "feature");
  assert.equal(categorizePRByLabels(["bug"], "something"), "fix");
  assert.equal(categorizePRByLabels(["not-autorelease"], "something"), "other");
  assert.equal(categorizePRByLabels(["release-please-disabled"], "something"), "other");
  // "released" is not "release"
  assert.equal(categorizePRByLabels([], "docs: document released versions"), "docs");
});

test("calculateFileStats computes addition, deletion, and file counts when under the limit", () => {
  const files = [
    { filename: "a.ts", additions: 10, deletions: 2 },
    { filename: "b.ts", additions: 5, deletions: 1 },
  ];
  const stats = calculateFileStats(files);
  assert.equal(stats.truncated, false);
  assert.equal(stats.total_files_changed, 2);
  assert.equal(stats.lines_added, 15);
  assert.equal(stats.lines_deleted, 3);
});

test("calculateFileStats flags truncation and omits counts when files reach or exceed the limit", () => {
  const files = Array.from({ length: 300 }, (_, i) => ({
    filename: `file_${i}.txt`,
    additions: 10,
    deletions: 5,
  }));
  const stats = calculateFileStats(files);
  assert.equal(stats.truncated, true);
  assert.equal(stats.total_files_changed, undefined);
  assert.equal(stats.lines_added, undefined);
  assert.equal(stats.lines_deleted, undefined);
});

test("calculateFileStats handles empty or null file lists", () => {
  const empty = calculateFileStats([]);
  assert.equal(empty.truncated, false);
  assert.equal(empty.total_files_changed, 0);
  assert.equal(empty.lines_added, 0);
  assert.equal(empty.lines_deleted, 0);

  const fromNull = calculateFileStats(null);
  assert.equal(fromNull.truncated, false);
  assert.equal(fromNull.total_files_changed, 0);
  assert.equal(fromNull.lines_added, 0);
  assert.equal(fromNull.lines_deleted, 0);
});

test("calculateFileStats does not mark an empty list truncated at a zero limit", () => {
  const stats = calculateFileStats([], 0);
  assert.equal(stats.truncated, false);
  assert.equal(stats.total_files_changed, 0);
  assert.equal(stats.lines_added, 0);
  assert.equal(stats.lines_deleted, 0);
});

test("calculateFileStats uses the default limit when the custom limit is NaN", () => {
  const files = Array.from({ length: 300 }, () => ({ additions: 1, deletions: 1 }));
  const stats = calculateFileStats(files, Number.NaN);
  assert.equal(stats.truncated, true);
  assert.equal(stats.total_files_changed, undefined);
  assert.equal(stats.lines_added, undefined);
  assert.equal(stats.lines_deleted, undefined);
});

test("calculateFileStats uses the default limit for a negative custom limit", () => {
  const files = [{ additions: 1, deletions: 1 }];
  const stats = calculateFileStats(files, -1);
  assert.equal(stats.truncated, false);
  assert.equal(stats.total_files_changed, 1);
  assert.equal(stats.lines_added, 1);
  assert.equal(stats.lines_deleted, 1);
});

test("calculateFileStats uses the default limit for an infinite custom limit", () => {
  const files = Array.from({ length: 300 }, () => ({ additions: 1, deletions: 1 }));
  const stats = calculateFileStats(files, Number.POSITIVE_INFINITY);
  assert.equal(stats.truncated, true);
  assert.equal(stats.total_files_changed, undefined);
  assert.equal(stats.lines_added, undefined);
  assert.equal(stats.lines_deleted, undefined);
});

test("calculateFileStats uses the default limit for a fractional custom limit", () => {
  const stats = calculateFileStats(
    [{ additions: 1, deletions: 1 }, { additions: 2, deletions: 3 }],
    1.5
  );
  assert.equal(stats.truncated, false);
  assert.equal(stats.total_files_changed, 2);
  assert.equal(stats.lines_added, 3);
  assert.equal(stats.lines_deleted, 4);
});

test("calculateFileStats ignores non-finite per-file line counts", () => {
  const stats = calculateFileStats([
    { additions: Number.NaN, deletions: Number.POSITIVE_INFINITY },
    { additions: 4, deletions: 2 },
  ]);
  assert.equal(stats.lines_added, 4);
  assert.equal(stats.lines_deleted, 2);
});

test("calculateFileStats ignores negative per-file line counts", () => {
  const stats = calculateFileStats([
    { additions: -3, deletions: -2 },
    { additions: 4, deletions: 1 },
  ]);
  assert.equal(stats.lines_added, 4);
  assert.equal(stats.lines_deleted, 1);
});

test("formatStat returns N/A for null or undefined and preserves numbers including zero", () => {
  assert.equal(formatStat(undefined), "N/A");
  assert.equal(formatStat(null), "N/A");
  assert.equal(formatStat(0), 0);
  assert.equal(formatStat(42), 42);
});

test("renderMarkdown formats release evidence table with numbers when file statistics are present", () => {
  const data = {
    repository: "owner/repo",
    from_tag: "v1.0.0",
    to_tag: "v1.1.0",
    stats: {
      total_commits: 10,
      total_prs: 2,
      total_files_changed: 5,
      lines_added: 120,
      lines_deleted: 30,
      total_contributors: 3,
    },
    contributors: [],
    breaking_changes: [],
    features: [],
    fixes: [],
    docs: [],
    dependencies: [],
    other: [],
    all_commits: [],
  };
  const markdown = renderMarkdown(data);
  assert.match(markdown, /\| 10 \| 2 \| 5 \| 120 \| 30 \| 3 \|/);
});

test("renderMarkdown handles omitted file statistics with N/A instead of misleading zeros", () => {
  const data = {
    repository: "owner/repo",
    from_tag: "v1.0.0",
    to_tag: "v2.0.0",
    stats: {
      total_commits: 500,
      total_prs: 45,
      total_contributors: 12,
    },
    contributors: [],
    breaking_changes: [],
    features: [],
    fixes: [],
    docs: [],
    dependencies: [],
    other: [],
    all_commits: [],
    warnings: [
      "Warning: File comparison was truncated at 300 files due to GitHub API limits; file and line statistics are omitted.",
    ],
  };
  const markdown = renderMarkdown(data);
  assert.match(markdown, /\| 500 \| 45 \| N\/A \| N\/A \| N\/A \| 12 \|/);
  assert.doesNotMatch(markdown, /\| 500 \| 45 \| 0 \| 0 \| 0 \| 12 \|/);
  assert.match(markdown, /## Warnings/);
});

test("renderMarkdown includes chore and release pull request evidence", () => {
  const data = {
    repository: "owner/repo",
    from_tag: "v1.0.0",
    to_tag: "v2.0.0",
    stats: {},
    contributors: [],
    breaking_changes: [],
    features: [],
    fixes: [],
    docs: [],
    chores: [
      { number: 7, title: "Update tooling", url: "https://example.test/7", author: "alice" },
    ],
    dependencies: [],
    release_prs: [
      { number: 8, title: "Release v2", url: "https://example.test/8", author: "bob" },
    ],
    other: [],
    all_commits: [],
  };

  const markdown = renderMarkdown(data);
  assert.match(markdown, /### Chores\n\n- \[#7\]\(https:\/\/example\.test\/7\) Update tooling by @alice/);
  assert.match(markdown, /### Release pull requests\n\n- \[#8\]\(https:\/\/example\.test\/8\) Release v2 by @bob/);
  assert.doesNotMatch(markdown, /No merged pull requests were associated/);
});
