# Multi-stage build for SalesBase application

# BUILD STAGE - Backend
FROM node:18-alpine AS backend-build

WORKDIR /app/backend

# Install build dependencies
RUN apk add --no-cache python3 make g++ git

# Copy backend package files
COPY package*.json ./

# Install all dependencies including development dependencies
RUN npm install

# Copy backend source code
COPY backend ./

# We'll create migrations directory in the entry point script if needed

# BUILD STAGE - Frontend
FROM node:18-alpine AS frontend-build

WORKDIR /app/frontend

# Copy frontend package files
COPY frontend/package*.json ./

# Install dependencies
RUN npm install

# Copy frontend source code
COPY frontend ./

# Build frontend
RUN npm run build

# PRODUCTION STAGE
FROM node:18-alpine

# Create app directory
WORKDIR /app

# Install production dependencies
RUN apk add --no-cache postgresql-client

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001

# Copy backend from build stage
COPY --from=backend-build /app/backend ./backend

# Copy frontend build from build stage
COPY --from=frontend-build /app/frontend/build ./frontend/build

# Create directories for backups and reports
RUN mkdir -p /app/backups /app/backend/reports

# Install PM2 globally
RUN npm install -g pm2

# Expose port
EXPOSE $PORT

# Create a non-root user and switch to it
RUN addgroup -g 1001 -S nodejs && \
    adduser -S -u 1001 -G nodejs nodejs

# Change ownership of the app directory
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Copy PM2 configuration
COPY --chown=nodejs:nodejs ecosystem.config.js ./

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD wget -qO- http://localhost:$PORT/health || exit 1

# Start the application with PM2
CMD ["pm2-runtime", "ecosystem.config.js"]