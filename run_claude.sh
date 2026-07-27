#!/bin/bash
export ANTHROPIC_BASE_URL="https://agentrouter.org/"
export ANTHROPIC_AUTH_TOKEN="sk-wPmIqRcNHUdPdDZ7pQdiDQcp2BI4Gj2upMJdczP0pddWJIig"
export ANTHROPIC_MODEL="claude-opus-4-8"
export CLAUDE_CODE_USE_AUTH_TOKEN="true"

claude "$@"
