#!/usr/bin/env node

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { renderMarkdown, type ReleaseContext } from "./logic.js";

const rawArgs = process.argv.slice(2);
const helpRequested = rawArgs.includes("--help") || rawArgs.includes("-h");
const jsonMode = rawArgs.includes("--json");
const args = rawArgs.filter(
  (arg) => arg !== "--json" && arg !== "--help" && arg !== "-h"
);
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

function usage(exitCode: number): never {
  const output = [
    "Usage: release-intel-report <owner/repository> <from-ref> <to-ref> [--json]",
    "",
    "Source and documentation:",
    "  https://github.com/barissozudogru/release-intel-mcp",
    "",
  ].join("\n");
  (exitCode === 0 ? process.stdout : process.stderr).write(output);
  process.exit(exitCode);
}

if (helpRequested) {
  usage(0);
}

if (args.length !== 3 || !repository || !fromRef || !toRef || !repository.includes("/")) {
  usage(1);
}

const repositoryParts = repository.split("/");
if (repositoryParts.length !== 2 || !repositoryParts[0] || !repositoryParts[1]) {
  usage(1);
}
const [owner, repo] = repositoryParts;
if (!/^[a-zA-Z0-9._-]+$/.test(owner) || !/^[a-zA-Z0-9._-]+$/.test(repo)) {
  usage(1);
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
