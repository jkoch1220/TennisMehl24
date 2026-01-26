# ============================================================================
# TennisMehl24 Backend - Dockerfile
# ============================================================================

FROM node:20-alpine

# Arbeitsverzeichnis
WORKDIR /app

# Package files kopieren
COPY package*.json ./

# Dependencies installieren
RUN npm ci --only=production

# TypeScript build
COPY tsconfig.json ./
COPY src ./src

# Build
RUN npm run build

# Nicht als root laufen
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001
USER nodejs

# Port
EXPOSE 3001

# Health Check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

# Start
CMD ["node", "dist/index.js"]
