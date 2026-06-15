# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.5.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm db:init

RUN pnpm build

# Production stage
FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache curl && corepack enable && corepack prepare pnpm@11.5.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Schema must be present before install so @prisma/client postinstall can generate
COPY prisma ./prisma

RUN pnpm install --frozen-lockfile --prod && \
    pnpm store prune

COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/main"]
