# syntax=docker/dockerfile:1

# Build from repository root:
#   docker build -f apps/backend/Dockerfile -t spacehaat-backend .

FROM node:22-alpine AS builder
WORKDIR /app

COPY apps/backend/package.json ./
RUN npm install

COPY apps/backend/tsconfig.json ./
COPY apps/backend/src ./src
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY apps/backend/package.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 8080
CMD ["node", "dist/server.js"]
