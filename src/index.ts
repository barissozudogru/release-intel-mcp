#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { createRequire } from "node:module";
import express from "express";
import { extractLinkedIssues, summarizeBody, categorizePRByLabels } from "./logic.js";

const require = createRequire(import.meta.url);
const { version: VERSION } = require("../package.json");

const GITHUB_API = "https://api.github.com";

// Fix #15: validate token at call-site (startup check is done in main())
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
    // Fix #17: read version from package.json
    "User-Agent": `release-intel-mcp/${VERSION}`,
  };
}

// Fix #12: add 15 s timeout to every fetch
async function githubGet<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: githubHeaders(),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub API error ${res.status} for ${url}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// Fix #9: add maxPages guard to prevent infinite loops
async function githubGetPaginated<T>(url: string, maxPages = 100): Promise<T[]> {
  const results: T[] = [];
  let nextUrl: string | null = url;
  let page = 0;
  while (nextUrl) {
    if (page >= maxPages) {
      console.error(`githubGetPaginated: maxPages (${maxPages}) reached for ${url}, stopping early`);
      break;
    }
    // Fix #12: timeout on paginated calls too
    const response: Response = await fetch(nextUrl, {
      headers: githubHeaders(),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`GitHub API error ${response.status} for ${nextUrl}: ${body}`);
    }
    const data = (await response.json()) as T[];
    results.push(...data);
    const linkHeader: string = response.headers.get("link") ?? "";
    const nextMatch: RegExpMatchArray | null = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    nextUrl = nextMatch ? nextMatch[1] : null;
    page++;
  }
  return results;
}

// Fix #2: concurrency limiter to avoid hitting rate limits with 250 simultaneous requests
async function batchAsync<T, R>(items: T[], fn: (item: T) => Promise<R>, concurrency = 10): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    results.push(...await Promise.all(batch.map(fn)));
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

// Fix #3: additions/deletions/changed_files/review_comments are not returned by the
// commits/{sha}/pulls summary endpoint: make them optional
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
  additions?: number;
  deletions?: number;
  changed_files?: number;
  review_comments?: number;
  comments: number;
  draft: boolean;
}

interface GitHubCompareResponse {
  commits: GitHubCommit[];
  files: Array<{ filename: string; status: string; changes: number; additions: number; deletions: number }>;
  ahead_by: number;
  behind_by: number;
  status: string;
  total_commits: number;
}

// Fix #17: use VERSION from package.json
const server = new McpServer(
  { name: "release-intel-mcp", version: VERSION },
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
      // Fix #11: validate owner/repo to safe characters
      owner: z.string().regex(/^[a-zA-Z0-9._-]+$/).describe("GitHub repository owner (user or organization)"),
      repo: z.string().regex(/^[a-zA-Z0-9._-]+$/).describe("GitHub repository name"),
      base: z.string().describe("Base ref (tag, branch, or commit SHA), the older point"),
      head: z.string().describe("Head ref (tag, branch, or commit SHA), the newer point"),
    }),
  },
  async ({ owner, repo, base, head }) => {
    // Fix #8: wrap in try/catch and return structured error
    try {
      const compareUrl = `${GITHUB_API}/repos/${owner}/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`;
      const comparison = await githubGet<GitHubCompareResponse>(compareUrl);

      // Fix #1: detect truncated commits from GitHub 250-commit API limit
      const commitsTruncated = comparison.total_commits > comparison.commits.length;
      const warnings: string[] = [];
      if (commitsTruncated) {
        warnings.push(
          `Warning: Only ${comparison.commits.length} of ${comparison.total_commits} commits were analyzed due to GitHub API limits.`
        );
      }

      // Fix #10: track failed lookups to surface in output
      let failedLookups = 0;

      // Fix #2: use batchAsync instead of raw Promise.all
      const enrichedCommits = await batchAsync(comparison.commits, async (commit) => {
        let prNumber: number | null = null;
        let prTitle: string | null = null;
        let prLabels: string[] = [];
        let prBodySummary: string = "";
        let linkedIssues: number[] = [];

        try {
          const prs = await githubGet<GitHubPR[]>(
            `${GITHUB_API}/repos/${owner}/${repo}/commits/${commit.sha}/pulls`
          );
          // Fix #6: only pick merged PRs; no fallback to unmerged
          const mergedPR = prs.find((pr) => pr.merged_at !== null) ?? null;
          if (mergedPR) {
            prNumber = mergedPR.number;
            prTitle = mergedPR.title;
            prLabels = mergedPR.labels.map((l) => l.name);
            prBodySummary = summarizeBody(mergedPR.body);
            linkedIssues = extractLinkedIssues(mergedPR.body);
          }
        } catch (err) {
          // Fix #10: count and detect fatal status codes
          failedLookups++;
          const msg = err instanceof Error ? err.message : String(err);
          if (/GitHub API error (429|401|403)/.test(msg)) {
            // Re-throw so batchAsync bubbles it up and we stop processing
            throw err;
          }
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
      }, 10);

      // Fix #10: append failed-lookup warning if any
      if (failedLookups > 0) {
        warnings.push(`${failedLookups} commit-to-PR lookups failed`);
      }

      const result: Record<string, unknown> = {
        base,
        head,
        repository: `${owner}/${repo}`,
        status: comparison.status,
        ahead_by: comparison.ahead_by,
        total_commits: comparison.total_commits,
        files_changed: comparison.files?.length ?? 0,
        commits: enrichedCommits,
      };

      if (warnings.length > 0) {
        result.warnings = warnings;
      }

      // Fix #18: compact JSON to save LLM context window
      const text = warnings.length > 0
        ? `${warnings.join("\n")}\n\n${JSON.stringify(result)}`
        : JSON.stringify(result);

      return {
        content: [{ type: "text" as const, text }],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
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
      // Fix #11: validate owner/repo
      owner: z.string().regex(/^[a-zA-Z0-9._-]+$/).describe("GitHub repository owner (user or organization)"),
      repo: z.string().regex(/^[a-zA-Z0-9._-]+$/).describe("GitHub repository name"),
      base: z.string().describe("Base ref (tag, branch, or commit SHA), the older point"),
      head: z.string().describe("Head ref (tag, branch, or commit SHA), the newer point"),
    }),
  },
  async ({ owner, repo, base, head }) => {
    // Fix #8: wrap in try/catch
    try {
      const compareUrl = `${GITHUB_API}/repos/${owner}/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`;
      const comparison = await githubGet<GitHubCompareResponse>(compareUrl);

      // Fix #1: detect truncation
      const warnings: string[] = [];
      if (comparison.total_commits > comparison.commits.length) {
        warnings.push(
          `Warning: Only ${comparison.commits.length} of ${comparison.total_commits} commits were analyzed due to GitHub API limits.`
        );
      }

      // Fix #10: track failed lookups
      let failedLookups = 0;

      // Collect PRs associated with each commit; track which SHAs have a merged PR
      const prMap = new Map<number, GitHubPR>();
      const commitShasWithPR = new Set<string>();

      // Fix #2: batchAsync instead of Promise.all
      await batchAsync(comparison.commits, async (commit) => {
        try {
          const prs = await githubGet<GitHubPR[]>(
            `${GITHUB_API}/repos/${owner}/${repo}/commits/${commit.sha}/pulls`
          );
          for (const pr of prs) {
            if (pr.merged_at !== null) {
              commitShasWithPR.add(commit.sha);
              if (!prMap.has(pr.number)) {
                prMap.set(pr.number, pr);
              }
            }
          }
        } catch (err) {
          // Fix #10: count failures; break on fatal codes
          failedLookups++;
          const msg = err instanceof Error ? err.message : String(err);
          if (/GitHub API error (429|401|403)/.test(msg)) {
            throw err;
          }
        }
      }, 10);

      if (failedLookups > 0) {
        warnings.push(`${failedLookups} commit-to-PR lookups failed`);
      }

      // Categorize PRs
      const categories: Record<string, typeof enrichedPRs> = {
        breaking: [],
        feature: [],
        fix: [],
        docs: [],
        chore: [],
        dependencies: [],
        release: [],
        other: [],
      };

      const enrichedPRs = Array.from(prMap.values()).map((pr) => {
        const labels = pr.labels.map((l) => l.name);
        // Fix #14: pass first commit message for conventional commit fallback (title is closest available here)
        const category = categorizePRByLabels(labels, pr.title);
        return {
          number: pr.number,
          title: pr.title,
          url: pr.html_url,
          // Fix #7: use PR author (pr.user.login), not commit author
          author: pr.user.login,
          merged_at: pr.merged_at,
          labels,
          category,
          body_summary: summarizeBody(pr.body),
          linked_issues: extractLinkedIssues(pr.body),
          // Fix #3: guard with ?? 0 for fields absent in summary response
          additions: pr.additions ?? 0,
          deletions: pr.deletions ?? 0,
          changed_files: pr.changed_files ?? 0,
          review_comments: pr.review_comments ?? 0,
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

      // Bug fix: categorize commits that have no associated merged PR (direct pushes)
      const directCommits = comparison.commits.filter((c) => !commitShasWithPR.has(c.sha));
      const directCommitObjects = directCommits.map((commit) => {
        const firstLine = commit.commit.message.split("\n")[0].trim();
        const category = categorizePRByLabels([], firstLine);
        const obj = {
          sha: commit.sha.slice(0, 8),
          sha_full: commit.sha,
          message: firstLine,
          author: commit.author?.login ?? commit.commit.author.name,
          committed_at: commit.commit.author.date,
          commit_url: commit.html_url,
          category,
          is_direct_commit: true,
        };
        categories[category].push(obj as unknown as typeof enrichedPRs[0]);
        return obj;
      });

      // Fix #13: stats already had other; keeping it consistent
      const result: Record<string, unknown> = {
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
          releases: categories.release.length,
          other: categories.other.length,
          direct_commits: directCommitObjects.length,
        },
        categorized: categories,
      };

      if (warnings.length > 0) {
        result.warnings = warnings;
      }

      // Fix #18: compact JSON
      const text = warnings.length > 0
        ? `${warnings.join("\n")}\n\n${JSON.stringify(result)}`
        : JSON.stringify(result);

      return {
        content: [{ type: "text" as const, text }],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  }
);

// Tool 3: get_release_summary
server.registerTool(
  "get_release_summary",
  {
    title: "Get Release Summary",
    description:
      "Generate a structured release context object ready for AI synthesis into release notes. Combines commit data, PR metadata, linked issues, contributor list, and aggregate statistics for the range between two tags.",
    inputSchema: z.object({
      // Fix #11: validate owner/repo
      owner: z.string().regex(/^[a-zA-Z0-9._-]+$/).describe("GitHub repository owner (user or organization)"),
      repo: z.string().regex(/^[a-zA-Z0-9._-]+$/).describe("GitHub repository name"),
      from_tag: z.string().describe("The previous release tag (base / older ref)"),
      to_tag: z.string().describe("The new release tag or HEAD (head / newer ref)"),
    }),
  },
  async ({ owner, repo, from_tag, to_tag }) => {
    // Fix #8: wrap in try/catch
    try {
      const compareUrl = `${GITHUB_API}/repos/${owner}/${repo}/compare/${encodeURIComponent(from_tag)}...${encodeURIComponent(to_tag)}`;
      const comparison = await githubGet<GitHubCompareResponse>(compareUrl);

      // Fix #1: detect truncation
      const warnings: string[] = [];
      if (comparison.total_commits > comparison.commits.length) {
        warnings.push(
          `Warning: Only ${comparison.commits.length} of ${comparison.total_commits} commits were analyzed due to GitHub API limits.`
        );
      }

      const contributorMap = new Map<string, { login: string; name: string; commits: number; prs: number }>();
      const prMap = new Map<number, GitHubPR & { linked_issues: number[]; body_summary: string; category: string; first_commit_message: string }>();

      // Fix #10: track failures
      let failedLookups = 0;

      // Fix #2: batchAsync instead of Promise.all
      await batchAsync(comparison.commits, async (commit) => {
        const login = commit.author?.login ?? commit.commit.author.email;
        const name = commit.commit.author.name;
        const firstCommitLine = commit.commit.message.split("\n")[0].trim();

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
                // Categorise by the PR's own title, matching
                // get_pull_requests_in_range. Passing the associated commit
                // message made a PR's category depend on which commit happened
                // to surface it during iteration, so the two tools disagreed
                // about the same PR.
                category: categorizePRByLabels(labels, pr.title),
                first_commit_message: firstCommitLine,
              });
              // Fix #7: PR count goes to PR author, not commit author
              const prAuthorLogin = pr.user.login;
              const prContributor = contributorMap.get(prAuthorLogin);
              if (prContributor) {
                prContributor.prs += 1;
              } else {
                // PR author may not appear in commits, add them
                contributorMap.set(prAuthorLogin, { login: prAuthorLogin, name: prAuthorLogin, commits: 0, prs: 1 });
              }
            }
          }
        } catch (err) {
          // Fix #10: count failures; break on fatal codes
          failedLookups++;
          const msg = err instanceof Error ? err.message : String(err);
          if (/GitHub API error (429|401|403)/.test(msg)) {
            throw err;
          }
        }
      }, 10);

      if (failedLookups > 0) {
        warnings.push(`${failedLookups} commit-to-PR lookups failed`);
      }

      const allPRs = Array.from(prMap.values());

      const breaking = allPRs.filter((pr) => pr.category === "breaking");
      const features = allPRs.filter((pr) => pr.category === "feature");
      const fixes = allPRs.filter((pr) => pr.category === "fix");
      const docs = allPRs.filter((pr) => pr.category === "docs");
      const chores = allPRs.filter((pr) => pr.category === "chore");
      const dependencies = allPRs.filter((pr) => pr.category === "dependencies");
      const releases = allPRs.filter((pr) => pr.category === "release");
      const other = allPRs.filter((pr) => pr.category === "other");

      // The /commits/{sha}/pulls endpoint does not return additions or deletions
      // (see GitHubPR above), so summing pr.additions is always 0. Use the Compare
      // API's per-file totals, which are populated.
      const compareFiles = comparison.files ?? [];
      const totalAdditions = compareFiles.reduce((sum, f) => sum + (f.additions ?? 0), 0);
      const totalDeletions = compareFiles.reduce((sum, f) => sum + (f.deletions ?? 0), 0);
      const totalFilesChanged = compareFiles.length;

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
        // Fix #7: use PR author login
        author: pr.user.login,
        merged_at: pr.merged_at,
        labels: pr.labels.map((l) => l.name),
        body_summary: pr.body_summary,
        linked_issues: pr.linked_issues,
        // Fix #3: guard with ?? 0
        changed_files: pr.changed_files ?? 0,
      });

      // Fix #13: include other count in stats
      const result: Record<string, unknown> = {
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
          release_prs: releases.length,
          other: other.length,
        },
        contributors,
        breaking_changes: breaking.map(formatPR),
        features: features.map(formatPR),
        fixes: fixes.map(formatPR),
        docs: docs.map(formatPR),
        chores: chores.map(formatPR),
        dependencies: dependencies.map(formatPR),
        release_prs: releases.map(formatPR),
        other: other.map(formatPR),
        linked_issues: allLinkedIssues,
        all_commits: comparison.commits.map((c) => ({
          sha: c.sha.slice(0, 8),
          message: c.commit.message.split("\n")[0].trim(),
          author: c.author?.login ?? c.commit.author.name,
          date: c.commit.author.date,
        })),
      };

      if (warnings.length > 0) {
        result.warnings = warnings;
      }

      // Fix #18: compact JSON
      const text = warnings.length > 0
        ? `${warnings.join("\n")}\n\n${JSON.stringify(result)}`
        : JSON.stringify(result);

      return {
        content: [{ type: "text" as const, text }],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  }
);

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    process.stdout.write([
      'release-intel-mcp - auditable GitHub release evidence over MCP',
      '',
      'Usage:',
      '  release-intel-mcp            Start the stdio MCP server',
      '  release-intel-mcp --http     Start the HTTP transport',
      '',
      'Source and documentation:',
      '  https://github.com/barissozudogru/release-intel-mcp',
      '',
    ].join('\n'));
    return;
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    process.stderr.write('Warning: GITHUB_TOKEN not set. All tool calls will fail.\n');
  }

  const useHttp = process.argv.includes('--http') || (process.env.TRANSPORT ?? '').toLowerCase() === 'http';

  if (useHttp) {
    const app = express();
    app.use(express.json());
    const port = parseInt(process.env.PORT || '3000', 10);

    app.post('/mcp', async (req, res) => {
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on('close', () => { transport.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    });

    app.get('/health', (_req, res) => {
      res.json({ status: 'ok', server: 'release-intel-mcp', version: VERSION });
    });

    app.listen(port, () => {
      process.stderr.write(`release-intel-mcp v${VERSION} listening on http://0.0.0.0:${port}/mcp\n`);
    });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    process.stderr.write(`release-intel-mcp v${VERSION} running on stdio\n`);
  }
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
