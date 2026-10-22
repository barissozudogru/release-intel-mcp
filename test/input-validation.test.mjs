import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const invalidRefCases = [
  {
    name: "get_changes_between_refs",
    arguments: { owner: "owner", repo: "repo", base: "", head: "v1" },
  },
  {
    name: "get_pull_requests_in_range",
    arguments: { owner: "owner", repo: "repo", base: "v1", head: " v2" },
  },
  {
    name: "get_release_summary",
    arguments: { owner: "owner", repo: "repo", from_tag: "v1", to_tag: "v2 " },
  },
];

test("MCP tools reject empty or padded refs before making an API request", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/index.js"],
    stderr: "pipe",
    env: {
      ...process.env,
      GITHUB_TOKEN: process.env.GITHUB_TOKEN ?? "input-validation-test-token",
      NODE_OPTIONS: [
        process.env.NODE_OPTIONS,
        `--import=${encodeURI("data:text/javascript,globalThis.fetch=async()=>{throw new Error('FETCH_CALLED')}")}`,
      ].filter(Boolean).join(" "),
    },
  });
  const client = new Client({ name: "input-validation-test", version: "1.0.0" });

  try {
    await client.connect(transport);
    for (const invalidRefCase of invalidRefCases) {
      const result = await client.callTool(invalidRefCase);
      assert.equal(result.isError, true, invalidRefCase.name);
      assert.match(result.content[0].text, /Input validation error/, invalidRefCase.name);
      assert.doesNotMatch(result.content[0].text, /FETCH_CALLED/, invalidRefCase.name);
    }
  } finally {
    await client.close().catch(() => undefined);
  }
});
