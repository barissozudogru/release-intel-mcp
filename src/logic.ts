// Pure helpers for release intelligence. No I/O, no module-level state, so
// they can be unit-tested in isolation.

// Fix #4: remove the overly broad /#(\d+)/g pattern that causes false positives
export function extractLinkedIssues(body: string | null): number[] {
  if (!body) return [];
  const patterns = [
    /(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\s+#(\d+)/gi,
    /(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\s+https?:\/\/github\.com\/[^/]+\/[^/]+\/(?:issues|pull)\/(\d+)/gi,
  ];
  const issues = new Set<number>();
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(body)) !== null) {
      issues.add(parseInt(match[1], 10));
    }
  }
  return Array.from(issues);
}

export function summarizeBody(body: string | null, maxLength = 300): string {
  if (!body) return "";
  const cleaned = body
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength).trimEnd() + "...";
}

// Fix #14: conventional commit prefix fallback when no labels match
export function categorizePRByLabels(labels: string[], commitMessage = ""): string {
  const lower = labels.map((l) => l.toLowerCase());
  if (lower.some((l) => /breaking/.test(l))) return "breaking";
  if (lower.some((l) => /\b(?:feature|feat|enhancement)s?\b/.test(l))) return "feature";
  if (lower.some((l) => /\b(?:fix(?:es)?|bug(?:s|fix|fixes)?|hotfix(?:es)?)\b/.test(l))) return "fix";
  if (lower.some((l) => /\b(?:doc|docs|documentation)\b/.test(l))) return "docs";
  if (lower.some((l) => /\b(?:dep|deps|dependency|dependencies)\b/.test(l))) return "dependencies";
  if (lower.some((l) => /\b(?:chore|ci|refactor|test|tests|testing)\b/.test(l))) return "chore";

  // Fallback: parse conventional commit prefix from commit message
  if (commitMessage) {
    const firstLine = commitMessage.split("\n")[0];
    if (/BREAKING CHANGE:/i.test(firstLine) || /^[\w-]+(?:\([^)]+\))?!:/.test(firstLine)) return "breaking";
    if (/^feat(?:ure)?[:(]/i.test(firstLine)) return "feature";
    if (/^fix(?:bug)?[:(]/i.test(firstLine)) return "fix";
    if (/^docs?[:(]/i.test(firstLine)) return "docs";
    if (/^(?:chore|ci|build|style|refactor)[:(]/i.test(firstLine)) return "chore";
    if (/^(?:dep|deps|bump)[:(]/i.test(firstLine)) return "dependencies";
  }

  return "other";
}
