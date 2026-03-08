# Use slim (Debian) so better-sqlite3 prebuilt binaries work; Alpine has no prebuilds.
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
# Install Semgrep (Python) and ripgrep so semgrep_scan and grep_code/grep_symbols work in the container
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip ripgrep \
    && pip3 install --no-cache-dir --break-system-packages semgrep \
    && apt-get clean && rm -rf /var/lib/apt/lists/*
ENV PATH="/usr/local/bin:${PATH}"
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/scripts ./scripts
RUN mkdir -p /app/data
EXPOSE 3001
ENV GATEWAY_PORT=3001
CMD ["node", "dist/index.js"]
