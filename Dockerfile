# Multi-stage build for browser-cmgr
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source files
COPY tsconfig.json ./
COPY src ./src
COPY images ./images
COPY index.html ./

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine

# Install Docker CLI
RUN apk add --no-cache docker-cli docker-cli-compose

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built files from builder
COPY --from=builder /app/build ./build
COPY --from=builder /app/images ./images
COPY --from=builder /app/index.html ./

# Expose the port (default is 8200, can be changed via EXPRESS_PORT env var)
EXPOSE 8200

# Run the application
CMD ["node", "build/main.js"]

