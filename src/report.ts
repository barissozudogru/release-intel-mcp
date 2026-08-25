#!/usr/bin/env node

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";

interface ReleaseItem {
  number: number;
  title: string;
  url: string;
  author: string;
}

interface ReleaseContext {
  repository: string;
  from_tag: string;
  to_tag: string;
  stats: Record<string, number>;
  contributors: Array<{ login: string; commits: number; prs: number }>;
  breaking_changes: ReleaseItem[];
  features: ReleaseItem[];
  fixes: ReleaseItem[];
  docs: ReleaseItem[];
  dependencies: ReleaseItem[];
  other: ReleaseItem[];
  all_commits: Array<{ sha: string; message: string; author: string }>;
  warnings?: string[];
}

const rawArgs = process.argv.slice(2);
const jsonMode = rawArgs.includes("--json");
const args = rawArgs.filter((arg) => arg !== "--json");
const [repository, fromRef, toRef] = args;

function firstText(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined;
  for (const item of content) {
    if (
      typeof item === "object" &&
      item !== null &&
      "type" in item &&
      item.type === "text" &&
      "text" in item &&
      typeof item.text === "string"
    ) {
      return item.text;
    }
  }
  return undefined;
}

function usage(): never {
  process.stderr.write(
    "Usage: release-intel-report <owner/repository> <from-ref> <to-ref> [--json]\n"
  );
  process.exit(1);
}

if (!repository || !fromRef || !toRef || !repository.includes("/")) {
  usage();
}

const [owner, repo] = repository.split("/", 2);
if (!owner || !repo) {
  usage();
}

function renderItems(title: string, items: ReleaseItem[]): string[] {
  if (!items.length) return [];
  return [
    `### ${title}`,
    "",
    ...items.map((item) => `- [#${item.number}](${item.url}) ${item.title} by @${item.author}`),
    "",
  ];
}

function renderMarkdown(data: ReleaseContext): string {
  const stats = data.stats;
  const lines = [
    `# Release evidence for ${data.repository}`,
    "",
    `Range: \`${data.from_tag}...${data.to_tag}\``,
    "",
    "| Commits | Pull requests | Files changed | Lines added | Lines deleted | Contributors |",
    "|---:|---:|---:|---:|---:|---:|",
    `| ${stats.total_commits ?? 0} | ${stats.total_prs ?? 0} | ${stats.total_files_changed ?? 0} | ${stats.lines_added ?? 0} | ${stats.lines_deleted ?? 0} | ${stats.total_contributors ?? 0} |`,
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
  lines.push(...renderItems("Dependencies", data.dependencies));
  lines.push(...renderItems("Other", data.other));

  if (
    !data.breaking_changes.length &&
    !data.features.length &&
    !data.fixes.length &&
    !data.docs.length &&
    !data.dependencies.length &&
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

const client = new Client({ name: "release-intel-report", version: "1.0.0" });
const serverPath = fileURLToPath(new URL("./index.js", import.meta.url));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath],
  cwd: process.cwd(),
  env: Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  ),
  stderr: "pipe",
});

try {
  await client.connect(transport);
  const result = await client.callTool({
    name: "get_release_summary",
    arguments: {
      owner,
      repo,
      from_tag: fromRef,
      to_tag: toRef,
    },
  });
  const text = firstText(result.content);
  if (!text) {
    throw new Error("The release tool returned no report");
  }
  if (result.isError) {
    throw new Error(text);
  }
  const jsonStart = text.indexOf("{");
  if (jsonStart < 0) {
    throw new Error("The release tool returned an unreadable response");
  }
  const data = JSON.parse(text.slice(jsonStart)) as ReleaseContext;
  process.stdout.write(jsonMode ? `${JSON.stringify(data, null, 2)}\n` : `${renderMarkdown(data)}\n`);
} catch (error) {
  process.stderr.write(
    `release-intel-report failed: ${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exitCode = 1;
} finally {
  await client.close().catch(() => undefined);
}
