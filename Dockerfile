# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.5.1 --activate

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install ALL dependencies (needed for build)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Generate Prisma Client
RUN pnpm db:init

# Build the application
RUN pnpm build

# Production stage
FROM node:22-alpine

WORKDIR /app

# Install curl for healthcheck
RUN apk add --no-cache curl && corepack enable && corepack prepare pnpm@11.5.1 --activate

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install ONLY production dependencies
RUN pnpm install --frozen-lockfile --prod && \
    pnpm store prune

# Copy built application from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Copy Prisma schema
COPY prisma ./prisma

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "dist/main"]