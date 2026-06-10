# Stage 1: Build static assets
FROM node:20-alpine as builder

WORKDIR /app

# Copy package lock and configs first for caching
COPY frontend/package*.json ./
RUN npm ci

# Copy the rest of the application files
COPY frontend/ .

# Build Vite app in production mode
RUN npm run build

# Stage 2: Run container with Nginx
FROM nginx:1.25-alpine

# Copy built frontend files to the Nginx default root directory
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration
COPY nginx/nginx.conf /etc/nginx/nginx.conf

# Expose port 80 for HTTP traffic
EXPOSE 80

# Health check checking the Nginx proxy path to backend (ensures reverse proxy is also working)
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost/health || exit 1

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
