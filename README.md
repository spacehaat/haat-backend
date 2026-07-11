# Spacehaat — Backend API (standalone repo)

Express + TypeScript API for workspace inventory, proposals, auth, leads, and smart match.

**GitHub:** [spacehaat/haat-backend](https://github.com/spacehaat/haat-backend)  
**Deploy:** Render, Railway, Fly.io, Docker

This repo is **self-contained**. It does not depend on files outside this folder.

Related repos:
- Web → [spacehaat/haat-web-app](https://github.com/spacehaat/haat-web-app)
- Mobile → [spacehaat/haat-mobile-app](https://github.com/spacehaat/haat-mobile-app)

## Local development

```bash
npm install
cp .env.example .env
# Edit .env
npm run dev
```

API default: `http://localhost:8080`

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Compile TypeScript → `dist/` |
| `npm start` | Run production build |
| `npm run seed` | Seed sample inventory |
| `npm run seed:leads` | Seed sample leads |

## Environment

Copy `.env.example` to `.env`. Never commit `.env`.

| Variable | Required | Notes |
|----------|----------|-------|
| `MONGODB_URI` | Yes | MongoDB Atlas or local |
| `JWT_SECRET` | Yes | Long random string |
| `CORS_ORIGIN` | Yes | Web app URL(s), comma-separated |
| `AWS_*` | Yes | S3 for images & PDFs |
| `OPENAI_API_KEY` | No | Smart Match AI parsing |

## Docker

```bash
docker build -t spacehaat-backend .
docker run --env-file .env -p 8080:8080 spacehaat-backend
```

## Deploy on Render

1. Connect **spacehaat/haat-backend** on [Render](https://dashboard.render.com)
2. Runtime: **Docker**, Dockerfile: `./Dockerfile`
3. Set env vars from `.env.example`
4. Verify: `curl https://YOUR-SERVICE.onrender.com/api/v1/health`

Set `CORS_ORIGIN` to your web URL(s), e.g.:

```env
CORS_ORIGIN=https://haat-web-app.vercel.app,http://localhost:5173
```
