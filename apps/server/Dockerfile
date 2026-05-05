# Build context = monorepo root.
# Build:  fly deploy   (fly.toml ở root chỉ vào file này)
FROM node:20-alpine

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

WORKDIR /app

# Manifests trước để tận dụng cache lớp install
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/server/package.json ./apps/server/package.json
COPY packages/shared/package.json ./packages/shared/package.json

# Install deps cho server + shared (bỏ qua web)
RUN pnpm install --frozen-lockfile --filter @ma-soi/server...

# Source
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/server ./apps/server

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

WORKDIR /app/apps/server
# tsx runtime: đọc thẳng .ts (cả server lẫn @ma-soi/shared) — tránh build dist phức tạp.
CMD ["pnpm", "exec", "tsx", "src/index.ts"]
