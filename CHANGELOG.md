# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-03-12

### Added

- `get_changes_between_refs` tool: enrich commits between two git refs with associated PR metadata, author information, and linked issues
- `get_pull_requests_in_range` tool: fetch and categorize merged PRs between two refs by label (breaking, feature, fix, docs, chore, dependencies)
- `get_release_summary` tool: generate a comprehensive structured release context object combining commits, PRs, contributors, and aggregate statistics for AI synthesis
- GitHub API integration using native `fetch` with pagination support
- GITHUB_TOKEN environment variable authentication
- TypeScript source with ES2022 / NodeNext module resolution
