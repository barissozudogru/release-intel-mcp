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

test("release summary sorts equal-count contributors by login", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/index.js"],
    stderr: "pipe",
    env: {
      ...process.env,
      GITHUB_TOKEN: process.env.GITHUB_TOKEN ?? "contributor-order-test-token",
      NODE_OPTIONS: [
        process.env.NODE_OPTIONS,
        `--import=data:text/javascript,${encodeURIComponent("globalThis.fetch=async(url)=>{" +
          "const value=String(url);" +
          "if(value.includes('/compare/')) return new Response(JSON.stringify({total_commits:2,commits:[" +
          "{sha:'first',commit:{message:'first',author:{name:'First',email:'first@example.test',date:'2026-01-01'}},author:{login:'alice'},html_url:'https://example.test/first'}," +
          "{sha:'second',commit:{message:'second',author:{name:'Second',email:'second@example.test',date:'2026-01-02'}},author:{login:'bob'},html_url:'https://example.test/second'}],files:[],ahead_by:2,behind_by:0,status:'ahead'}),{status:200,headers:{'content-type':'application/json'}});" +
          "await new Promise(resolve=>setTimeout(resolve,value.includes('/second/pulls')?0:20));" +
          "const login=value.includes('/second/pulls')?'dana':'charlie';" +
          "return new Response(JSON.stringify([{number:value.includes('/second/pulls')?2:1,title:'Feature',body:null,state:'closed',merged_at:'2026-01-03',html_url:'https://example.test/pr',user:{login},labels:[],comments:0,draft:false}]),{status:200,headers:{'content-type':'application/json'}});" +
          "}")}`,
      ].filter(Boolean).join(" "),
    },
  });
  const client = new Client({ name: "contributor-order-test", version: "1.0.0" });

  try {
    await client.connect(transport);
    const result = await client.callTool({
      name: "get_release_summary",
      arguments: { owner: "owner", repo: "repo", from_tag: "v1", to_tag: "v2" },
    });
    assert.equal(result.isError, undefined);
    const data = JSON.parse(result.content[0].text);
    assert.deepEqual(data.contributors.map((contributor) => contributor.login), [
      "alice",
      "bob",
      "charlie",
      "dana",
    ]);
  } finally {
    await client.close().catch(() => undefined);
  }
});
