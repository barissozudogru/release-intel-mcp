# release-intel-mcp

An MCP server that generates release intelligence from GitHub repository data. It correlates commits, pull requests, issues, and contributors between any two git refs and returns structured context ready for AI synthesis into release notes, changelogs, and release summaries.

---

## Tools

### `get_changes_between_refs`

Get all commits between two git refs enriched with associated PR metadata, author information, and linked issues.

| Field   | Type   | Description                              |
|---------|--------|------------------------------------------|
| `owner` | string | GitHub repository owner or organization |
| `repo`  | string | GitHub repository name                   |
| `base`  | string | Base ref (older tag, branch, or SHA)     |
| `head`  | string | Head ref (newer tag, branch, or SHA)     |

### `get_pull_requests_in_range`

Get all merged PRs between two refs, automatically categorized by label into: `breaking`, `feature`, `fix`, `docs`, `chore`, `dependencies`, `other`.

Input fields are identical to `get_changes_between_refs`.

### `get_release_summary`

Generate a structured release context object combining commit data, PR metadata, linked issues, contributor list, and aggregate statistics.

| Field      | Type   | Description                     |
|------------|--------|---------------------------------|
| `owner`    | string | GitHub repository owner         |
| `repo`     | string | GitHub repository name          |
| `from_tag` | string | Previous release tag (base)     |
| `to_tag`   | string | New release tag or HEAD         |

---

## Setup

All options require a GitHub personal access token with `repo` read access.
Generate one at: https://github.com/settings/tokens

---

### Option A: stdio (local process)

The standard approach: the MCP client spawns the server as a local subprocess.

#### Claude Desktop

Config file: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "release-intel": {
      "command": "npx",
      "args": ["-y", "@barissozudogru/release-intel-mcp"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_token"
      }
    }
  }
}
```

#### Claude Code

```bash
claude mcp add release-intel -e GITHUB_TOKEN=ghp_your_token -- npx -y @barissozudogru/release-intel-mcp
```

#### Cursor

Config file: `~/.cursor/mcp.json`

```json
{
  "mcpServers": {
    "release-intel": {
      "command": "npx",
      "args": ["-y", "@barissozudogru/release-intel-mcp"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_token"
      }
    }
  }
}
```

#### Windsurf

Config file: `~/.codeium/windsurf/mcp_config.json`

```json
{
  "mcpServers": {
    "release-intel": {
      "command": "npx",
      "args": ["-y", "@barissozudogru/release-intel-mcp"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_token"
      }
    }
  }
}
```

#### VS Code + Copilot

Config file: `.vscode/mcp.json`

```json
{
  "servers": {
    "release-intel": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@barissozudogru/release-intel-mcp"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_token"
      }
    }
  }
}
```

#### Cline

Config file: `~/.cline/mcp_settings.json` (or via the Cline extension settings UI)

```json
{
  "mcpServers": {
    "release-intel": {
      "command": "npx",
      "args": ["-y", "@barissozudogru/release-intel-mcp"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_token"
      }
    }
  }
}
```

#### Continue.dev

Config file: `~/.continue/config.yaml`

```yaml
mcpServers:
  - name: release-intel
    command: npx
    args:
      - -y
      - "@barissozudogru/release-intel-mcp"
    env:
      GITHUB_TOKEN: ghp_your_token
```

#### Zed

Config file: `~/.config/zed/settings.json`

```json
{
  "context_servers": {
    "release-intel": {
      "command": {
        "path": "npx",
        "args": ["-y", "@barissozudogru/release-intel-mcp"],
        "env": {
          "GITHUB_TOKEN": "ghp_your_token"
        }
      }
    }
  }
}
```

#### JetBrains (AI Assistant plugin)

```json
{
  "mcpServers": {
    "release-intel": {
      "command": "npx",
      "args": ["-y", "@barissozudogru/release-intel-mcp"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_token"
      }
    }
  }
}
```

---

### Option B: HTTP (remote / stateless)

Run the server as an HTTP endpoint. Useful for remote clients, shared team deployments, or clients that prefer URL-based connections.

```bash
GITHUB_TOKEN=ghp_your_token npx @barissozudogru/release-intel-mcp --http
```

By default this starts on port 3000. Set `PORT` to change it.

#### Cursor (HTTP)

```json
{
  "mcpServers": {
    "release-intel": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

#### VS Code + Copilot (HTTP)

```json
{
  "servers": {
    "release-intel": {
      "type": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

#### Windsurf (HTTP)

```json
{
  "mcpServers": {
    "release-intel": {
      "serverUrl": "http://localhost:3000/mcp"
    }
  }
}
```

#### Continue.dev (HTTP)

```yaml
mcpServers:
  - name: release-intel
    type: streamable-http
    url: http://localhost:3000/mcp
```

A health check endpoint is available at `GET /health`.

---

### Option C: Docker

```bash
docker build -t release-intel-mcp .
docker run -p 3000:3000 -e GITHUB_TOKEN=ghp_your_token release-intel-mcp
```

The container starts in HTTP mode by default. The MCP endpoint is at `http://localhost:3000/mcp`.

---

## Environment Variables

| Variable       | Required | Default | Description                               |
|----------------|----------|---------|-------------------------------------------|
| `GITHUB_TOKEN` | Yes      | -       | GitHub personal access token (repo scope) |
| `TRANSPORT`    | No       | stdio   | Set to `http` to enable HTTP mode         |
| `PORT`         | No       | 3000    | HTTP port (HTTP mode only)                |

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
