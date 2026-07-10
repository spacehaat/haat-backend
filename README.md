# Spacehaat — Backend API

Express + TypeScript API for workspace inventory, proposals, auth, leads, and smart match.

**Deploy independently** from this folder (Railway, Render, Fly.io, Docker, EC2).

## Local development

From **repo root**:

```bash
npm install
cp apps/backend/.env.example apps/backend/.env
# Edit apps/backend/.env
npm run dev:backend
```

From **this folder** (after `npm install` at root):

```bash
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

Build from **repository root**:

```bash
docker build -f apps/backend/Dockerfile -t spacehaat-backend .
```

Run:

```bash
docker run --env-file apps/backend/.env -p 8080:8080 spacehaat-backend
```

## Production deploy

1. Set `NODE_ENV=production`
2. Run `npm run build && npm start`
3. Point `CORS_ORIGIN` at your web app URL (e.g. `https://app.spacehaat.in`)
4. Use MongoDB Atlas + S3 in production

Pairs with `apps/web` (browser) and `apps/mobile` (Expo).
