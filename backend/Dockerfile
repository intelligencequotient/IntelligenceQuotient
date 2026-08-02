# ─── Stage 1: build the TypeScript ────────────────────────────────────────────
FROM node:20-bookworm-slim AS build

WORKDIR /app

# Copy manifests first so `npm ci` is cached until dependencies actually change.
COPY package*.json ./
RUN npm ci

COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build


# ─── Stage 2: runtime ─────────────────────────────────────────────────────────
# The PDF pipeline shells out to Python, so the runtime image needs both.
FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PYTHONUNBUFFERED=1

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-pip python3-venv tini \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python deps for extract.py / classify.py, in their own venv so they cannot
# collide with anything Debian ships.
COPY scripts/pdf-processor/requirements.txt ./scripts/pdf-processor/requirements.txt
RUN python3 -m venv /opt/venv \
 && /opt/venv/bin/pip install --no-cache-dir -r scripts/pdf-processor/requirements.txt
ENV PATH="/opt/venv/bin:$PATH"

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY scripts ./scripts

# Temp workspace for PDF runs; owned by the unprivileged user.
RUN mkdir -p /app/temp && chown -R node:node /app
USER node

EXPOSE 3000

# tini reaps the Python child processes the pipeline spawns.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/src/main.js"]
