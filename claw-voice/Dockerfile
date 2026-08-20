# Phase 3 (Fly deploy). NOT needed for the local spike - see README.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1

# uv for fast, reproducible installs.
RUN pip install --no-cache-dir uv

WORKDIR /app

# Install deps first for layer caching. uv.lock should exist (run `uv lock`);
# falls back to resolving if it doesn't.
COPY pyproject.toml uv.lock* ./
RUN uv sync --frozen --no-dev 2>/dev/null || uv sync --no-dev

COPY src ./src

# Bake Silero VAD + turn-detector weights into the image so cold starts don't
# stall downloading them on first call.
RUN uv run src/agent.py download-files || true

# Run as non-root.
RUN useradd --create-home appuser && chown -R appuser /app
USER appuser

# Worker mode (outbound connection to LiveKit Cloud; no inbound port).
CMD ["uv", "run", "src/agent.py", "start"]
