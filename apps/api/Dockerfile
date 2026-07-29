# Build context must be the repo root (npm workspaces monorepo):
#   docker build -f apps/api/Dockerfile -t budget-manager-api .

FROM node:22-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci --workspace=@budget-manager/api --workspace=@budget-manager/contracts --include-workspace-root

FROM node:22-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY apps/api apps/api
COPY packages/contracts packages/contracts
RUN npm run prisma:generate -w apps/api
RUN npm run build -w apps/api

FROM node:22-alpine AS runtime
RUN apk add --no-cache openssl
ENV NODE_ENV=production
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci --workspace=@budget-manager/api --workspace=@budget-manager/contracts --include-workspace-root --omit=dev
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/apps/api/prisma apps/api/prisma
RUN npm run prisma:generate -w apps/api

EXPOSE 3000
WORKDIR /repo/apps/api
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]
