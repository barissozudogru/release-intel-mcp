<p align="center">
  <img src="./assets/banner-release-intel.svg" alt="release-intel-mcp" width="888" />
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@barissozudogru/release-intel-mcp"><img alt="npm version" src="https://img.shields.io/npm/v/@barissozudogru/release-intel-mcp?style=flat-square&color=8B5CF6"></a>
  <a href="https://www.npmjs.com/package/@barissozudogru/release-intel-mcp"><img alt="npm downloads" src="https://img.shields.io/npm/dm/@barissozudogru/release-intel-mcp?style=flat-square&color=8B5CF6"></a>
  <a href="https://github.com/barissozudogru/release-intel-mcp/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/barissozudogru/release-intel-mcp/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://registry.modelcontextprotocol.io/v0.1/servers/io.github.barissozudogru%2Frelease-intel/versions/latest"><img alt="MCP Registry" src="https://img.shields.io/badge/MCP_Registry-listed-0F172A?style=flat-square"></a>
  <a href="./LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/License-MIT-8B5CF6?style=flat-square"></a>
</p>

# release-intel-mcp

Build release context from repository evidence instead of a blank prompt. The server compares two Git refs and correlates commits, merged pull requests, linked issues, labels, changed files, and contributors into a structured release record.

[Tool page](https://petri-labs.org/tools/release-intel-mcp/) · [npm](https://www.npmjs.com/package/@barissozudogru/release-intel-mcp) · Listed in the official [MCP Registry](https://registry.modelcontextprotocol.io/v0.1/servers/io.github.barissozudogru%2Frelease-intel/versions/latest)

## Start in one minute

Create a fine-grained GitHub token with read-only access to the repositories you want to inspect. Repository contents and pull requests are sufficient for the current tools. No write permission is needed.

```json
{
  "mcpServers": {
    "release-intel": {
      "command": "npx",
      "args": ["-y", "@barissozudogru/release-intel-mcp"],
      "env": {
        "GITHUB_TOKEN": "your_read_only_token"
      }
    }
  }
}
```

Then ask the client for a bounded range:

```text
Use release-intel to build release evidence for owner/repository
from v1.4.0 to v1.5.0. Separate merged PRs from direct commits
and preserve links to the repository record.
```

The token stays in the local server process and is sent only to the GitHub API.

## Proof on this repository

A verified run against the stable range `v0.5.1...8a2f350` returned:

```text
Repository:        barissozudogru/release-intel-mcp
Commits:           14
Merged PRs:        1
Files changed:     12
Lines added:       286
Lines deleted:     135
Contributors:      1
```

The response also includes commit SHAs, messages, authors, pull request categories, linked issues, and warnings when GitHub truncates or fails part of the evidence lookup.

If this saves you time, consider [starring the repository](https://github.com/barissozudogru/release-intel-mcp). It helps other developers find it.

## Tools

| Tool | What it returns |
|---|---|
| `get_changes_between_refs` | Commits enriched with merged pull request metadata and linked issues |
| `get_pull_requests_in_range` | Merged pull requests grouped as breaking, feature, fix, docs, chore, dependency, release, or other |
| `get_release_summary` | A complete release evidence object with aggregate statistics and contributors |

The categorization uses labels and conventional title signals. Repository labels, issue links, and pull request hygiene directly affect the result. The server provides evidence and structure; the final release narrative still needs review.

## Release report command

The package includes a terminal command that produces Markdown by default:

```bash
GITHUB_TOKEN=your_read_only_token \
  npx --yes --package @barissozudogru/release-intel-mcp \
  release-intel-report owner/repository v1.4.0 v1.5.0
```

Use `--json` when another tool will consume the report:

```bash
release-intel-report owner/repository v1.4.0 v1.5.0 --json
```

## GitHub Action

Attach the evidence report to the workflow summary before publishing a release:

```yaml
name: Release evidence

on:
  workflow_dispatch:
    inputs:
      from_ref:
        required: true
      to_ref:
        required: true

jobs:
  evidence:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read
    steps:
      - uses: barissozudogru/release-intel-mcp@v0.7.2
        with:
          from-ref: ${{ inputs.from_ref }}
          to-ref: ${{ inputs.to_ref }}
          token: ${{ secrets.GITHUB_TOKEN }}
```

This action reads repository data and writes Markdown to the job summary. It does not publish a release or modify repository content.

## Client setup

<details>
<summary>Claude Desktop, Cursor, Windsurf, Cline, and similar clients</summary>

Use the stdio configuration from the quickstart. The server entry is identical across these clients even when their config file locations differ.

</details>

<details>
<summary>VS Code with Copilot</summary>

Create `.vscode/mcp.json`:

```json
{
  "servers": {
    "release-intel": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@barissozudogru/release-intel-mcp"],
      "env": {
        "GITHUB_TOKEN": "your_read_only_token"
      }
    }
  }
}
```

</details>

<details>
<summary>Streamable HTTP</summary>

```bash
GITHUB_TOKEN=your_read_only_token \
  npx @barissozudogru/release-intel-mcp --http
```

The MCP endpoint is `http://localhost:3000/mcp` and the health endpoint is `http://localhost:3000/health`. Set `PORT` to change the port.

</details>

<details>
<summary>Docker</summary>

```bash
docker build -t release-intel-mcp .
docker run -p 3000:3000 \
  -e GITHUB_TOKEN=your_read_only_token \
  release-intel-mcp
```

Connect an HTTP client to `http://localhost:3000/mcp`.

</details>

## Local development

```bash
npm install
npm test
npm run build
GITHUB_TOKEN=your_read_only_token node dist/index.js
```

Requirements: Node.js 18 or newer.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the development workflow.

## Security and limits

- Use a fine-grained, read-only token restricted to the required repositories.
- The server never needs permission to write releases, issues, or pull requests.
- GitHub's compare endpoint limits very large ranges. The response reports truncation.
- Unlinked direct commits remain visible but cannot inherit pull request metadata.
- Release categories are evidence-backed heuristics, not editorial conclusions.

## License

[MIT](./LICENSE)
