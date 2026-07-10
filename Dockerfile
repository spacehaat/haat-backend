# syntax=docker/dockerfile:1
# Standalone haat-backend repo — build from repository root:
#   docker build -t spacehaat-backend .

FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 8080
CMD ["node", "dist/server.js"]
