# Stage 1: Build the application
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package descriptors
COPY package.json package-lock.json* ./

# Install all dependencies (including build-time devDependencies)
RUN npm ci || npm install

# Copy the rest of the source code
COPY . .

# Build client-side assets and compile the server-side controller
RUN npm run build

# Stage 2: Production runner
FROM node:20-alpine AS runner

WORKDIR /app

# Set production environment
ARG APP_VERSION
ENV NODE_ENV=production
ENV PORT=3000
ENV APP_VERSION=$APP_VERSION

# Copy package descriptors
COPY package.json package-lock.json* ./

# Install production-only dependencies to reduce final image size
RUN npm ci --omit=dev || npm install --omit=dev

# Copy pre-built application bundle and assets
COPY --from=builder /app/dist ./dist

# Expose port 3000
EXPOSE 3000

# Start the application using Node's runtime
CMD ["node", "dist/server.cjs"]
