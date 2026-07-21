// Pure helpers for release intelligence. No I/O, no module-level state, so
// they can be unit-tested in isolation.

// Fix #4: remove the overly broad /#(\d+)/g pattern that causes false positives
export function extractLinkedIssues(body: string | null): number[] {
  if (!body) return [];
  const patterns = [
    /(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi,
    /(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+https?:\/\/github\.com\/[^/]+\/[^/]+\/issues\/(\d+)/gi,
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
  if (lower.some((l) => l.includes("breaking"))) return "breaking";
  if (lower.some((l) => l.includes("feature") || l.includes("enhancement") || l.includes("feat"))) return "feature";
  if (lower.some((l) => l.includes("fix") || l.includes("bug"))) return "fix";
  if (lower.some((l) => l.includes("doc"))) return "docs";
  if (lower.some((l) => l.includes("dep") || l.includes("depend"))) return "dependencies";
  if (lower.some((l) => l.includes("chore") || l.includes("ci") || l.includes("refactor") || l.includes("test"))) return "chore";

  // Fallback: parse conventional commit prefix from commit message
  if (commitMessage) {
    const firstLine = commitMessage.split("\n")[0];
    if (/BREAKING CHANGE:/i.test(firstLine) || /\w+!:/.test(firstLine)) return "breaking";
    if (/^feat(?:ure)?[:(]/i.test(firstLine)) return "feature";
    if (/^fix(?:bug)?[:(]/i.test(firstLine)) return "fix";
    if (/^docs?[:(]/i.test(firstLine)) return "docs";
    if (/^(?:chore|ci|build|style|refactor)[:(]/i.test(firstLine)) return "chore";
    if (/^(?:dep|deps|bump)[:(]/i.test(firstLine)) return "dependencies";
  }

  return "other";
}
