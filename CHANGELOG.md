# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] - 2026-03-12

### Fixed

- lines_added/lines_deleted now fall back to Compare API file-level data when no PRs exist
- Direct commits (without associated PRs) are now categorized using conventional commit parsing

### Added

- direct_commits count in get_pull_requests_in_range stats
- Commits without PRs appear in categorized output with is_direct_commit flag

## [0.3.0] - 2026-03-12

### Added

- Streamable HTTP transport for remote MCP clients
- `--http` flag and `TRANSPORT=http` environment variable to select HTTP mode
- Health check endpoint at `/health`
- Dockerfile for containerized deployment
- smithery.yaml for Smithery registry
- Configuration examples for 10+ MCP clients (Claude Desktop, Claude Code, Cursor, Windsurf, VS Code, Cline, Continue, Zed, JetBrains, ChatGPT)

## [0.2.0] - 2026-03-12

### Fixed

- GitHub Compare API 250-commit limit now detected with explicit warning
- Concurrent API calls capped at 10 (was unbounded, triggering GitHub rate limits)
- PR metadata fields (additions, deletions, changed_files) now optional (were undefined from summary endpoint)
- Linked issue extraction removed false-positive bare #number pattern
- PR association only picks merged PRs (was falling back to arbitrary unmerged PRs)
- Contributor PR counts attributed to PR author instead of commit author
- Rate limit errors (429/401/403) now detected and stop batch processing
- Zod import uses standard convention (import { z } from "zod")

### Added

- Concurrency-limited batch API calls (10 at a time)
- Structured MCP error responses with isError flag
- Pagination safeguard (max 100 pages) prevents infinite loops
- Fetch timeout (15s) on all API calls
- Input validation on owner/repo parameters
- Conventional commit parsing as fallback when PRs have no labels
- GITHUB_TOKEN validation warning at startup
- "other" category count in release summary stats
- Dynamic version from package.json
- Failed lookup warnings in tool output

### Changed

- JSON responses use compact format (saves LLM context window tokens)

### Removed

- Dead code: unused commitShas variable

## [0.1.0] - 2026-03-12

### Added

- `get_changes_between_refs` tool: enrich commits between two git refs with associated PR metadata, author information, and linked issues
- `get_pull_requests_in_range` tool: fetch and categorize merged PRs between two refs by label (breaking, feature, fix, docs, chore, dependencies)
- `get_release_summary` tool: generate a comprehensive structured release context object combining commits, PRs, contributors, and aggregate statistics for AI synthesis
- GitHub API integration using native `fetch` with pagination support
- GITHUB_TOKEN environment variable authentication
- TypeScript source with ES2022 / NodeNext module resolution
