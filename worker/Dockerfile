FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    LAST30DAYS_MEMORY_DIR=/data/last30days \
    HOME=/home/worker

WORKDIR /app

# System deps + Node 20 (NodeSource) for the Claude CLI (Tier-1 synthesis).
RUN apt-get update \
  && apt-get install -y --no-install-recommends git curl ca-certificates ffmpeg gnupg \
  && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
  && apt-get install -y --no-install-recommends nodejs \
  && rm -rf /var/lib/apt/lists/*

# Claude Code CLI: enables `claude -p` subscription-billed synthesis (Tier 1).
# No token is baked in — CLAUDE_CODE_OAUTH_TOKEN is supplied as a runtime env var.
RUN npm install -g @anthropic-ai/claude-code

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Writable HOME + ~/.claude so the CLI can run non-interactively (REVIEW.md A3).
RUN mkdir -p /data/last30days "$HOME/.claude" \
  && chmod -R 777 "$HOME" /data/last30days

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
