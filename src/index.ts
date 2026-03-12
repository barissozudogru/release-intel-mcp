#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";

const GITHUB_API = "https://api.github.com";

function getToken(): string {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN environment variable is not set");
  }
  return token;
}

function githubHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${getToken()}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "release-intel-mcp/0.1.0",
  };
}

async function githubGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: githubHeaders() });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub API error ${res.status} for ${url}: ${body}`);
  }
  return res.json() as Promise<T>;
}

async function githubGetPaginated<T>(url: string): Promise<T[]> {
  const results: T[] = [];
  let nextUrl: string | null = url;
  while (nextUrl) {
    const response: Response = await fetch(nextUrl, { headers: githubHeaders() });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`GitHub API error ${response.status} for ${nextUrl}: ${body}`);
    }
    const page = (await response.json()) as T[];
    results.push(...page);
    const linkHeader: string = response.headers.get("link") ?? "";
    const nextMatch: RegExpMatchArray | null = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    nextUrl = nextMatch ? nextMatch[1] : null;
  }
  return results;
}

interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      email: string;
      date: string;
    };
  };
  author: {
    login: string;
  } | null;
  html_url: string;
}

interface GitHubPR {
  number: number;
  title: string;
  body: string | null;
  state: string;
  merged_at: string | null;
  html_url: string;
  user: {
    login: string;
  };
  labels: Array<{ name: string }>;
  additions: number;
  deletions: number;
  changed_files: number;
  review_comments: number;
  comments: number;
  draft: boolean;
}

interface GitHubCompareResponse {
  commits: GitHubCommit[];
  files: Array<{ filename: string; status: string; changes: number }>;
  ahead_by: number;
  behind_by: number;
  status: string;
  total_commits: number;
}

function extractLinkedIssues(body: string | null): number[] {
  if (!body) return [];
  const patterns = [
    /(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi,
    /(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+https?:\/\/github\.com\/[^/]+\/[^/]+\/issues\/(\d+)/gi,
    /#(\d+)/g,
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

function summarizeBody(body: string | null, maxLength = 300): string {
  if (!body) return "";
  const cleaned = body
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength).trimEnd() + "...";
}

function categorizePRByLabels(labels: string[]): string {
  const lower = labels.map((l) => l.toLowerCase());
  if (lower.some((l) => l.includes("breaking"))) return "breaking";
  if (lower.some((l) => l.includes("feature") || l.includes("enhancement") || l.includes("feat"))) return "feature";
  if (lower.some((l) => l.includes("fix") || l.includes("bug"))) return "fix";
  if (lower.some((l) => l.includes("doc"))) return "docs";
  if (lower.some((l) => l.includes("dep") || l.includes("depend"))) return "dependencies";
  if (lower.some((l) => l.includes("chore") || l.includes("ci") || l.includes("refactor") || l.includes("test"))) return "chore";
  return "other";
}

const server = new McpServer(
  { name: "release-intel-mcp", version: "0.1.0" },
  { capabilities: { logging: {} } }
);

// Tool 1: get_changes_between_refs
server.registerTool(
  "get_changes_between_refs",
  {
    title: "Get Changes Between Refs",
    description:
      "Get all commits between two git refs enriched with associated PR metadata, author information, and linked issues. Uses the GitHub compare API.",
    inputSchema: z.object({
      owner: z.string().describe("GitHub repository owner (user or organization)"),
      repo: z.string().describe("GitHub repository name"),
      base: z.string().describe("Base ref (tag, branch, or commit SHA) — the older point"),
      head: z.string().describe("Head ref (tag, branch, or commit SHA) — the newer point"),
    }),
  },
  async ({ owner, repo, base, head }) => {
    const compareUrl = `${GITHUB_API}/repos/${owner}/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`;
    const comparison = await githubGet<GitHubCompareResponse>(compareUrl);

    const enrichedCommits = await Promise.all(
      comparison.commits.map(async (commit) => {
        let prNumber: number | null = null;
        let prTitle: string | null = null;
        let prLabels: string[] = [];
        let prBodySummary: string = "";
        let linkedIssues: number[] = [];

        try {
          const prs = await githubGet<GitHubPR[]>(
            `${GITHUB_API}/repos/${owner}/${repo}/commits/${commit.sha}/pulls`
          );
          const mergedPR = prs.find((pr) => pr.merged_at !== null) ?? prs[0] ?? null;
          if (mergedPR) {
            prNumber = mergedPR.number;
            prTitle = mergedPR.title;
            prLabels = mergedPR.labels.map((l) => l.name);
            prBodySummary = summarizeBody(mergedPR.body);
            linkedIssues = extractLinkedIssues(mergedPR.body);
          }
        } catch {
          // PR lookup is best-effort; proceed without PR data
        }

        const firstLine = commit.commit.message.split("\n")[0].trim();

        return {
          sha: commit.sha.slice(0, 8),
          sha_full: commit.sha,
          message: firstLine,
          author_name: commit.commit.author.name,
          author_email: commit.commit.author.email,
          author_login: commit.author?.login ?? null,
          committed_at: commit.commit.author.date,
          commit_url: commit.html_url,
          pr_number: prNumber,
          pr_title: prTitle,
          pr_labels: prLabels,
          pr_body_summary: prBodySummary,
          linked_issues: linkedIssues,
        };
      })
    );

    const result = {
      base,
      head,
      repository: `${owner}/${repo}`,
      status: comparison.status,
      ahead_by: comparison.ahead_by,
      total_commits: comparison.total_commits,
      files_changed: comparison.files?.length ?? 0,
      commits: enrichedCommits,
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Tool 2: get_pull_requests_in_range
server.registerTool(
  "get_pull_requests_in_range",
  {
    title: "Get Pull Requests in Range",
    description:
      "Get all merged pull requests between two refs with full metadata including labels, linked issues, review counts, and files changed. PRs are categorized by label into: breaking, feature, fix, docs, chore, dependencies, other.",
    inputSchema: z.object({
      owner: z.string().describe("GitHub repository owner (user or organization)"),
      repo: z.string().describe("GitHub repository name"),
      base: z.string().describe("Base ref (tag, branch, or commit SHA) — the older point"),
      head: z.string().describe("Head ref (tag, branch, or commit SHA) — the newer point"),
    }),
  },
  async ({ owner, repo, base, head }) => {
    // Get commit SHAs in range to filter PRs
    const compareUrl = `${GITHUB_API}/repos/${owner}/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`;
    const comparison = await githubGet<GitHubCompareResponse>(compareUrl);
    const commitShas = new Set(comparison.commits.map((c) => c.sha));

    // Collect PRs associated with each commit
    const prMap = new Map<number, GitHubPR>();
    await Promise.all(
      comparison.commits.map(async (commit) => {
        try {
          const prs = await githubGet<GitHubPR[]>(
            `${GITHUB_API}/repos/${owner}/${repo}/commits/${commit.sha}/pulls`
          );
          for (const pr of prs) {
            if (pr.merged_at !== null && !prMap.has(pr.number)) {
              prMap.set(pr.number, pr);
            }
          }
        } catch {
          // best-effort
        }
      })
    );

    // Categorize PRs
    const categories: Record<string, typeof enrichedPRs> = {
      breaking: [],
      feature: [],
      fix: [],
      docs: [],
      chore: [],
      dependencies: [],
      other: [],
    };

    const enrichedPRs = Array.from(prMap.values()).map((pr) => {
      const labels = pr.labels.map((l) => l.name);
      const category = categorizePRByLabels(labels);
      return {
        number: pr.number,
        title: pr.title,
        url: pr.html_url,
        author: pr.user.login,
        merged_at: pr.merged_at,
        labels,
        category,
        body_summary: summarizeBody(pr.body),
        linked_issues: extractLinkedIssues(pr.body),
        additions: pr.additions,
        deletions: pr.deletions,
        changed_files: pr.changed_files,
        review_comments: pr.review_comments,
        total_comments: pr.comments,
      };
    });

    // Sort by merged_at descending
    enrichedPRs.sort((a, b) => {
      const aTime = a.merged_at ? new Date(a.merged_at).getTime() : 0;
      const bTime = b.merged_at ? new Date(b.merged_at).getTime() : 0;
      return bTime - aTime;
    });

    for (const pr of enrichedPRs) {
      categories[pr.category].push(pr);
    }

    const result = {
      repository: `${owner}/${repo}`,
      base,
      head,
      total_prs: enrichedPRs.length,
      total_commits_in_range: comparison.total_commits,
      stats: {
        breaking: categories.breaking.length,
        features: categories.feature.length,
        fixes: categories.fix.length,
        docs: categories.docs.length,
        chores: categories.chore.length,
        dependencies: categories.dependencies.length,
        other: categories.other.length,
      },
      categorized: categories,
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Tool 3: get_release_summary
server.registerTool(
  "get_release_summary",
  {
    title: "Get Release Summary",
    description:
      "Generate a comprehensive, structured release context object ready for AI synthesis into release notes. Combines commit data, PR metadata, linked issues, contributor list, and aggregate statistics for the range between two tags.",
    inputSchema: z.object({
      owner: z.string().describe("GitHub repository owner (user or organization)"),
      repo: z.string().describe("GitHub repository name"),
      from_tag: z.string().describe("The previous release tag (base / older ref)"),
      to_tag: z.string().describe("The new release tag or HEAD (head / newer ref)"),
    }),
  },
  async ({ owner, repo, from_tag, to_tag }) => {
    const compareUrl = `${GITHUB_API}/repos/${owner}/${repo}/compare/${encodeURIComponent(from_tag)}...${encodeURIComponent(to_tag)}`;
    const comparison = await githubGet<GitHubCompareResponse>(compareUrl);

    const contributorMap = new Map<string, { login: string; name: string; commits: number; prs: number }>();
    const prMap = new Map<number, GitHubPR & { linked_issues: number[]; body_summary: string; category: string }>();

    // Process each commit and fetch associated PRs
    await Promise.all(
      comparison.commits.map(async (commit) => {
        const login = commit.author?.login ?? commit.commit.author.email;
        const name = commit.commit.author.name;

        const existing = contributorMap.get(login);
        if (existing) {
          existing.commits += 1;
        } else {
          contributorMap.set(login, { login, name, commits: 1, prs: 0 });
        }

        try {
          const prs = await githubGet<GitHubPR[]>(
            `${GITHUB_API}/repos/${owner}/${repo}/commits/${commit.sha}/pulls`
          );
          for (const pr of prs) {
            if (pr.merged_at !== null && !prMap.has(pr.number)) {
              const labels = pr.labels.map((l) => l.name);
              prMap.set(pr.number, {
                ...pr,
                linked_issues: extractLinkedIssues(pr.body),
                body_summary: summarizeBody(pr.body),
                category: categorizePRByLabels(labels),
              });
              const contributor = contributorMap.get(login);
              if (contributor) contributor.prs += 1;
            }
          }
        } catch {
          // best-effort
        }
      })
    );

    const allPRs = Array.from(prMap.values());

    const breaking = allPRs.filter((pr) => pr.category === "breaking");
    const features = allPRs.filter((pr) => pr.category === "feature");
    const fixes = allPRs.filter((pr) => pr.category === "fix");
    const docs = allPRs.filter((pr) => pr.category === "docs");
    const chores = allPRs.filter((pr) => pr.category === "chore");
    const dependencies = allPRs.filter((pr) => pr.category === "dependencies");
    const other = allPRs.filter((pr) => pr.category === "other");

    const totalAdditions = allPRs.reduce((sum, pr) => sum + (pr.additions ?? 0), 0);
    const totalDeletions = allPRs.reduce((sum, pr) => sum + (pr.deletions ?? 0), 0);
    const totalFilesChanged = comparison.files?.length ?? 0;

    const allLinkedIssues = Array.from(
      new Set(allPRs.flatMap((pr) => pr.linked_issues))
    );

    const contributors = Array.from(contributorMap.values()).sort(
      (a, b) => b.commits - a.commits
    );

    const formatPR = (pr: (typeof allPRs)[0]) => ({
      number: pr.number,
      title: pr.title,
      url: pr.html_url,
      author: pr.user.login,
      merged_at: pr.merged_at,
      labels: pr.labels.map((l) => l.name),
      body_summary: pr.body_summary,
      linked_issues: pr.linked_issues,
      changed_files: pr.changed_files,
    });

    const result = {
      repository: `${owner}/${repo}`,
      from_tag,
      to_tag,
      generated_at: new Date().toISOString(),
      stats: {
        total_commits: comparison.total_commits,
        total_prs: allPRs.length,
        total_files_changed: totalFilesChanged,
        total_contributors: contributors.length,
        lines_added: totalAdditions,
        lines_deleted: totalDeletions,
        linked_issues: allLinkedIssues.length,
        breaking_changes: breaking.length,
        new_features: features.length,
        bug_fixes: fixes.length,
        docs_changes: docs.length,
        chores: chores.length,
        dependency_updates: dependencies.length,
      },
      contributors,
      breaking_changes: breaking.map(formatPR),
      features: features.map(formatPR),
      fixes: fixes.map(formatPR),
      docs: docs.map(formatPR),
      chores: chores.map(formatPR),
      dependencies: dependencies.map(formatPR),
      other: other.map(formatPR),
      linked_issues: allLinkedIssues,
      all_commits: comparison.commits.map((c) => ({
        sha: c.sha.slice(0, 8),
        message: c.commit.message.split("\n")[0].trim(),
        author: c.author?.login ?? c.commit.author.name,
        date: c.commit.author.date,
      })),
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("release-intel-mcp running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
