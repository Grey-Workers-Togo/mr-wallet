# Build context must be the repo root (npm workspaces monorepo):
#   docker build -f apps/api/Dockerfile -t mr-wallet-api .

FROM node:24-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/sync-protocol/package.json packages/sync-protocol/package.json
RUN npm ci --workspace=@mr-wallet/api --workspace=@mr-wallet/contracts --workspace=@mr-wallet/sync-protocol --include-workspace-root --ignore-scripts

FROM node:24-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY apps/api apps/api
COPY packages/contracts packages/contracts
COPY packages/sync-protocol packages/sync-protocol
RUN npm run build -w packages/contracts
RUN npm run build -w packages/sync-protocol
RUN npm run prisma:generate -w apps/api
RUN npm run build -w apps/api

FROM node:24-alpine AS runtime
RUN apk add --no-cache openssl curl
ENV NODE_ENV=production
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/sync-protocol/package.json packages/sync-protocol/package.json
COPY --from=build /repo/apps/api/prisma apps/api/prisma
RUN npm ci --workspace=@mr-wallet/api --workspace=@mr-wallet/contracts --workspace=@mr-wallet/sync-protocol --include-workspace-root --omit=dev --ignore-scripts
RUN npm run prisma:generate -w apps/api
COPY --from=build /repo/packages/contracts/dist packages/contracts/dist
COPY --from=build /repo/packages/sync-protocol/dist packages/sync-protocol/dist
COPY --from=build /repo/apps/api/dist apps/api/dist
RUN chown -R node:node /repo

USER node
EXPOSE 3000
WORKDIR /repo/apps/api
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3000/api/v1/health || exit 1
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]
