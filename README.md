<div align="center">

# release-intel-mcp

**Release Intelligence Engine for Claude**

![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)
![Node](https://img.shields.io/badge/Node-%3E%3D18-green?logo=node.js)
![License](https://img.shields.io/badge/License-MIT-yellow)
![MCP](https://img.shields.io/badge/MCP-compatible-purple)

</div>

---

## What It Does

`release-intel-mcp` is a Model Context Protocol server that pre-processes GitHub repository data so Claude can synthesize high-quality, intelligent release notes. It correlates commits, pull requests, issues, and authors between any two git refs — giving Claude a rich, structured context object rather than raw git log output.

Instead of pasting a raw `git log` into Claude, you point this server at your repository and refs, and it returns:

- Every commit enriched with its associated PR title, labels, and body summary
- Merged PRs automatically categorized by label (breaking change, feature, fix, docs, chore, dependencies)
- Linked GitHub issues extracted from PR bodies
- Contributor statistics (commits and PRs per author)
- Aggregate stats: total commits, files changed, lines added/deleted, PRs merged

---

## Setup for Claude Desktop

### 1. Install or configure the package

```bash
npm install -g @barissozudogru/release-intel-mcp
```

Or reference it directly via `npx` in the config.

### 2. Add to your Claude Desktop config

Open `~/Library/Application Support/Claude/claude_desktop_config.json` and add:

```json
{
  "mcpServers": {
    "release-intel-mcp": {
      "command": "npx",
      "args": ["-y", "@barissozudogru/release-intel-mcp"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_personal_access_token_here"
      }
    }
  }
}
```

### 3. GitHub Token requirements

The token needs the following scopes:

- `repo` (read access to repositories, pull requests, issues)

Generate one at: https://github.com/settings/tokens

### 4. Restart Claude Desktop

After saving the config, restart Claude Desktop. You should see `release-intel-mcp` listed under connected MCP servers.

---

## Tools

### `get_changes_between_refs`

Get all commits between two git refs enriched with PR and author data.

**Input:**

| Field   | Type   | Description                                |
|---------|--------|--------------------------------------------|
| `owner` | string | GitHub repository owner or organization   |
| `repo`  | string | GitHub repository name                     |
| `base`  | string | Base ref (older tag, branch, or SHA)       |
| `head`  | string | Head ref (newer tag, branch, or SHA)       |

**Example output (truncated):**

```json
{
  "repository": "acme/my-app",
  "base": "v1.2.0",
  "head": "v1.3.0",
  "total_commits": 12,
  "commits": [
    {
      "sha": "a1b2c3d4",
      "message": "feat: add dark mode toggle",
      "author_login": "jsmith",
      "pr_number": 142,
      "pr_title": "Add dark mode support",
      "pr_labels": ["feature", "frontend"],
      "pr_body_summary": "Implements a dark/light mode toggle persisted to localStorage.",
      "linked_issues": [98, 103]
    }
  ]
}
```

---

### `get_pull_requests_in_range`

Get all merged PRs between two refs, categorized by label with full metadata.

**Input:** same as `get_changes_between_refs`

**Categories:** `breaking`, `feature`, `fix`, `docs`, `chore`, `dependencies`, `other`

**Example output (truncated):**

```json
{
  "repository": "acme/my-app",
  "total_prs": 8,
  "stats": {
    "breaking": 0,
    "features": 3,
    "fixes": 4,
    "docs": 1
  },
  "categorized": {
    "feature": [
      {
        "number": 142,
        "title": "Add dark mode support",
        "author": "jsmith",
        "merged_at": "2026-03-10T14:22:00Z",
        "labels": ["feature"],
        "changed_files": 7
      }
    ]
  }
}
```

---

### `get_release_summary`

Generate a structured release summary ready for direct AI synthesis into release notes.

**Input:**

| Field      | Type   | Description                              |
|------------|--------|------------------------------------------|
| `owner`    | string | GitHub repository owner or organization |
| `repo`     | string | GitHub repository name                   |
| `from_tag` | string | Previous release tag (base)              |
| `to_tag`   | string | New release tag or HEAD                  |

**Example output (truncated):**

```json
{
  "repository": "acme/my-app",
  "from_tag": "v1.2.0",
  "to_tag": "v1.3.0",
  "stats": {
    "total_commits": 12,
    "total_prs": 8,
    "total_contributors": 4,
    "lines_added": 847,
    "lines_deleted": 203,
    "breaking_changes": 0,
    "new_features": 3,
    "bug_fixes": 4
  },
  "contributors": [
    { "login": "jsmith", "name": "Jane Smith", "commits": 6, "prs": 3 }
  ],
  "features": [...],
  "fixes": [...],
  "breaking_changes": []
}
```

---

## Usage Examples

Once configured, ask Claude things like:

> "Using release-intel-mcp, generate release notes for acme/my-app between v1.2.0 and v1.3.0."

> "Get the release summary for barissozudogru/release-intel-mcp from v0.1.0 to HEAD, then write a CHANGELOG entry."

> "What breaking changes are between main and the v2.0.0 tag in my-org/api-server?"

> "Summarize the contributors and their work for the last release of acme/frontend."

---

## Local Development

```bash
git clone https://github.com/barissozudogru/release-intel-mcp.git
cd release-intel-mcp
npm install
npm run build
GITHUB_TOKEN=ghp_... node dist/index.js
```

---

## License

MIT
