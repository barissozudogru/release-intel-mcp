import { test } from "node:test";
import assert from "node:assert/strict";

import {
  extractLinkedIssues,
  summarizeBody,
  categorizePRByLabels,
} from "../dist/logic.js";

test("extractLinkedIssues returns an empty array for null or empty bodies", () => {
  assert.deepEqual(extractLinkedIssues(null), []);
  assert.deepEqual(extractLinkedIssues(""), []);
});

test("extractLinkedIssues picks up close/fix/resolve keywords", () => {
  assert.deepEqual(extractLinkedIssues("closes #123"), [123]);
  assert.deepEqual(extractLinkedIssues("Fixes #456 and resolves #789"), [456, 789]);
  assert.deepEqual(extractLinkedIssues("CLOSES #5"), [5]);
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

test("extractLinkedIssues deduplicates repeated references", () => {
  assert.deepEqual(extractLinkedIssues("closes #1 and also fixes #1"), [1]);
});

test("extractLinkedIssues ignores bare #numbers without a closing keyword", () => {
  // Regression guard for the old overly broad /#(\d+)/g pattern.
  assert.deepEqual(extractLinkedIssues("see #100 for context"), []);
});

test("categorizePRByLabels maps common GitHub labels", () => {
  assert.equal(categorizePRByLabels(["breaking"]), "breaking");
  assert.equal(categorizePRByLabels(["enhancement"]), "feature");
  assert.equal(categorizePRByLabels(["bug"]), "fix");
  assert.equal(categorizePRByLabels(["documentation"]), "docs");
  assert.equal(categorizePRByLabels(["dependencies"]), "dependencies");
  assert.equal(categorizePRByLabels(["chore"]), "chore");
});

test("categorizePRByLabels avoids false positives from substrings", () => {
  assert.equal(categorizePRByLabels(["suffix"]), "other");
  assert.equal(categorizePRByLabels(["defeat"]), "other");
  assert.equal(categorizePRByLabels(["docker"]), "other");
  assert.equal(categorizePRByLabels(["deploy"]), "other");
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

test("summarizeBody strips HTML comments and normalizes line endings", () => {
  const result = summarizeBody("hello <!-- secret --> world\r\nsecond");
  assert.ok(!result.includes("secret"));
  assert.ok(result.includes("hello"));
  assert.ok(result.includes("world"));
  assert.ok(result.includes("\n"));
  assert.ok(!result.includes("\r"));
});
