// Pure helpers for release intelligence. No I/O, no module-level state, so
// they can be unit-tested in isolation.

// Fix #4: remove the overly broad /#(\d+)/g pattern that causes false positives
export function extractLinkedIssues(body: string | null): number[] {
  if (!body) return [];
  const reference = String.raw`(?:[\w.-]+\/[\w.-]+)?#\d+(?![\p{L}\p{N}\p{M}_-])|https?:\/\/github\.com\/[^/]+\/[^/]+\/(?:issues|pull)\/\d+(?![\p{L}\p{N}\p{M}_-])`;
  const pattern = new RegExp(
    String.raw`(?<![\p{L}\p{N}\p{M}_-])(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\s+((?:${reference})(?:\s*(?:,\s*and|,|and)\s*(?:${reference}))*)`,
    "giu"
  );
  const referencePattern = new RegExp(
    String.raw`(?:[\w.-]+\/[\w.-]+)?#(\d+)(?![\p{L}\p{N}\p{M}_-])|https?:\/\/github\.com\/[^/]+\/[^/]+\/(?:issues|pull)\/(\d+)(?![\p{L}\p{N}\p{M}_-])`,
    "giu"
  );
  const issues = new Set<number>();
  let match;
  while ((match = pattern.exec(body)) !== null) {
    let referenceMatch;
    while ((referenceMatch = referencePattern.exec(match[1])) !== null) {
      issues.add(parseInt(referenceMatch[1] ?? referenceMatch[2], 10));
    }
  }
  return Array.from(issues);
}

export function summarizeBody(body: string | null, maxLength?: number): string {
  if (!body) return "";
  const limit = maxLength ?? 300;
  const cleaned = body
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (cleaned.length <= limit) return cleaned;
  if (maxLength === undefined) return cleaned.slice(0, limit).trimEnd() + "...";
  if (limit <= 3) return cleaned.slice(0, Math.max(0, limit));
  return cleaned.slice(0, limit - 3).trimEnd() + "...";
}

// Fix #14: conventional commit prefix fallback when no labels match
export function categorizePRByLabels(labels: string[], commitMessage = ""): string {
  const lower = labels.map((l) => l.toLowerCase());
  // Release PRs are bookkeeping, not change content. They are checked first
  // because their bodies quote the whole changelog, which otherwise pulls them
  // into whichever category the quoted text happens to match.
  if (lower.some((l) => /\bautorelease\b|\brelease-please\b/.test(l))) return "release";
  if (lower.some((l) => /breaking/.test(l))) return "breaking";
  if (lower.some((l) => /\b(?:feature|feat|enhancement)s?\b/.test(l))) return "feature";
  if (lower.some((l) => /\b(?:fix(?:es)?|bug(?:s|fix|fixes)?|hotfix(?:es)?)\b/.test(l))) return "fix";
  if (lower.some((l) => /\b(?:doc|docs|documentation)\b/.test(l))) return "docs";
  if (lower.some((l) => /\b(?:dep|deps|dependency|dependencies)\b/.test(l))) return "dependencies";
  if (lower.some((l) => /\b(?:chore|ci|refactor|test|tests|testing)\b/.test(l))) return "chore";

  // Fallback: parse conventional commit prefix from commit message
  if (commitMessage) {
    const firstLine = commitMessage.split("\n")[0];
    // Checked before the other prefixes so chore(release): reads as a release
    // rather than a chore. The word boundary keeps "released" out.
    if (/^release\b\s*[:(]/i.test(firstLine) || /^chore\(release\)/i.test(firstLine)) {
      return "release";
    }
    if (/BREAKING CHANGE:/i.test(firstLine) || /^[\w-]+(?:\([^)]+\))?!:/.test(firstLine)) return "breaking";
    if (/^feat(?:ure)?[:(]/i.test(firstLine)) return "feature";
    if (/^fix(?:bug)?[:(]/i.test(firstLine)) return "fix";
    if (/^docs?[:(]/i.test(firstLine)) return "docs";
    if (/^(?:chore|ci|build|style|refactor)[:(]/i.test(firstLine)) return "chore";
    if (/^(?:dep|deps|bump)[:(]/i.test(firstLine)) return "dependencies";
  }

  return "other";
}

export interface FileStatItem {
  filename?: string;
  status?: string;
  changes?: number;
  additions?: number;
  deletions?: number;
}

export interface FileStats {
  total_files_changed?: number;
  lines_added?: number;
  lines_deleted?: number;
  truncated: boolean;
}

// Calculate file and line modification statistics from compare files. The GitHub
// compare API caps the files array at 300 items without pagination. When the
// limit is reached, statistics are omitted to avoid reporting partial sums.
export function calculateFileStats(
  files: FileStatItem[] | null | undefined,
  limit = 300
): FileStats {
  const list = files ?? [];
  if (list.length >= limit) {
    return { truncated: true };
  }
  return {
    truncated: false,
    total_files_changed: list.length,
    lines_added: list.reduce((sum, f) => sum + (f.additions ?? 0), 0),
    lines_deleted: list.reduce((sum, f) => sum + (f.deletions ?? 0), 0),
  };
}

export interface ReleaseItem {
  number: number;
  title: string;
  url: string;
  author: string;
}

export interface ReleaseContext {
  repository: string;
  from_tag: string;
  to_tag: string;
  stats: Record<string, number | undefined>;
  contributors: Array<{ login: string; commits: number; prs: number }>;
  breaking_changes: ReleaseItem[];
  features: ReleaseItem[];
  fixes: ReleaseItem[];
  docs: ReleaseItem[];
  chores?: ReleaseItem[];
  dependencies: ReleaseItem[];
  release_prs?: ReleaseItem[];
  other: ReleaseItem[];
  all_commits: Array<{ sha: string; message: string; author: string }>;
  warnings?: string[];
}

// Display N/A for undefined statistics so omitted counts are not rendered as zero
export function formatStat(value: number | null | undefined): string | number {
  return value ?? "N/A";
}

export function renderItems(title: string, items: ReleaseItem[]): string[] {
  if (!items.length) return [];
  return [
    `### ${title}`,
    "",
    ...items.map((item) => `- [#${item.number}](${item.url}) ${item.title} by @${item.author}`),
    "",
  ];
}

export function renderMarkdown(data: ReleaseContext): string {
  const stats = data.stats ?? {};
  const lines = [
    `# Release evidence for ${data.repository}`,
    "",
    `Range: \`${data.from_tag}...${data.to_tag}\``,
    "",
    "| Commits | Pull requests | Files changed | Lines added | Lines deleted | Contributors |",
    "|---:|---:|---:|---:|---:|---:|",
    `| ${stats.total_commits ?? 0} | ${stats.total_prs ?? 0} | ${formatStat(stats.total_files_changed)} | ${formatStat(stats.lines_added)} | ${formatStat(stats.lines_deleted)} | ${stats.total_contributors ?? 0} |`,
    "",
  ];

  if (data.warnings?.length) {
    lines.push("## Warnings", "", ...data.warnings.map((warning) => `- ${warning}`), "");
  }

  lines.push("## Pull request evidence", "");
  lines.push(...renderItems("Breaking changes", data.breaking_changes));
  lines.push(...renderItems("Features", data.features));
  lines.push(...renderItems("Fixes", data.fixes));
  lines.push(...renderItems("Documentation", data.docs));
  lines.push(...renderItems("Chores", data.chores ?? []));
  lines.push(...renderItems("Dependencies", data.dependencies));
  lines.push(...renderItems("Release pull requests", data.release_prs ?? []));
  lines.push(...renderItems("Other", data.other));

  if (
    !data.breaking_changes.length &&
    !data.features.length &&
    !data.fixes.length &&
    !data.docs.length &&
    !(data.chores?.length ?? 0) &&
    !data.dependencies.length &&
    !(data.release_prs?.length ?? 0) &&
    !data.other.length
  ) {
    lines.push("No merged pull requests were associated with this range.", "");
  }

  lines.push("## Commit evidence", "");
  for (const commit of data.all_commits) {
    lines.push(`- \`${commit.sha}\` ${commit.message} by ${commit.author}`);
  }
  lines.push("");

  return lines.join("\n");
}
