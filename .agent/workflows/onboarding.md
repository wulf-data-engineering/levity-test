---
description: Onboarding guide for new developers (requirements, MCP server setup)
---

# Onboarding

Create a markdown artifact with greeting to developer that you will guide through setup.
That artifact might turn into an implementation plan later.

# Requirements

Run command exactly to check for missing requirements:

// turbo-all

```bash
echo "git" && \ # mac: brew install git; linux: sudo apt install git; win: winget install Git.Git
git --version && \
echo "cargo" && \ # mac: brew install rustup; linux: curl https://sh.rustup.rs -sSf | sh; win: winget install Rustlang.Rustup
cargo --version && \
echo "cargo lambda" && \ # cargo install cargo-lambda
cargo lambda --version && \
echo "cargo nextest" && \ # cargo install cargo-nextest --locked
cargo nextest --version && \
echo "npm" && \ # mac: brew install node; linux: sudo apt install nodejs npm; win: winget install OpenJS.NodeJS
npm --version && \
echo "docker" && \ # mac: brew install --cask docker; linux: sudo apt install docker.io; win: winget install Docker.DockerDesktop
docker --version && \
echo "docker compose" && \
docker compose version && \
echo "aws" && \ # mac: brew install awscli; linux: sudo apt install awscli; win: winget install Amazon.AWSCLI
aws --version &&  \
echo "done"
```

If there are missing dependencies:

- Turn artifact into implementation plan
- Add tasks to install missing dependencies to the plan
- State which you can and will install
- State in detail which need to be installed manually and how

# Git Repo

Check if this repository is a git repository.
If not mention that in the artifact.

# MCP servers

Check which MCP servers are already available by inspecting your available tools.
Do NOT try to read the config file directly as it contains secrets.

Mention briefly the existing suggested MCP servers in artifact.
Explain missing suggested MCP servers from @mcp_server_template.json in artifact.

For each credentials/token explain separately where and how to obtain.

Explain developer has to merge json manually with ~/.gemini/antigravity/mcp_config.json for security reasons.

# Docker Compose Alias

Add following information exactly to artifact:

The project relies on `docker compose` (v2), but AI assistants often try to use the legacy `docker-compose` command. To prevent friction and errors, please add an alias to your shell configuration (`~/.zshrc`, `~/.bashrc`, etc.):

```bash
alias docker-compose="docker compose"
```

# Summary

Summarize artifact in final output.
If there are missing dependencies ask to proceed with implementation plan.
Clarify what you d at "proceed" and what dev has to do.
If there are none there is no need to proceed: Workflow done.

# Git Repo Check

Check if the repository is connected to a remote:

```bash
git remote -v
```

If no remote is configured (empty output), suggest running the initial setup workflow:

> It seems this is a fresh project without a connected repository.
> Please run `/initial-setup` to configure your GitHub repository and AWS environment.
