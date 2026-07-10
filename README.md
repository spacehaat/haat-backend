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

Build from **this repository root** (standalone `haat-backend` repo):

```bash
docker build -t spacehaat-backend .
docker run --env-file .env -p 8080:8080 spacehaat-backend
```

## Deploy on Render

### 1. Prerequisites

- Code pushed to [github.com/spacehaat/haat-backend](https://github.com/spacehaat/haat-backend)
- [MongoDB Atlas](https://www.mongodb.com/atlas) M0 free cluster + connection string
- AWS S3 bucket + IAM keys (required for uploads/PDFs)

### 2. Create Web Service (manual)

1. [dashboard.render.com](https://dashboard.render.com) → **New** → **Web Service**
2. Connect **spacehaat/haat-backend**
3. Settings:

| Setting | Value |
|---------|--------|
| **Region** | Singapore |
| **Branch** | `main` |
| **Runtime** | **Docker** |
| **Dockerfile Path** | `./Dockerfile` |
| **Instance Type** | Free |

4. Add environment variables (see `.env.example`). Minimum required:

```env
NODE_ENV=production
PORT=8080
MONGODB_URI=mongodb+srv://...
JWT_SECRET=<32+ random chars>
CORS_ORIGIN=https://your-web-app.com
ADMIN_EMAIL=admin@spacehaat.in
ADMIN_PASSWORD=<strong password>
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=ap-south-1
AWS_S3_BUCKET=your-bucket
AWS_S3_FOLDER=inventory
AWS_S3_PUBLIC_URL=https://your-bucket.s3.ap-south-1.amazonaws.com
```

5. **Create Web Service** → wait for build (~3–5 min)

### 3. Or use Blueprint (render.yaml)

1. **New** → **Blueprint**
2. Connect repo → Render reads `render.yaml`
3. Fill in secrets marked `sync: false` when prompted

### 4. Verify

```bash
curl https://YOUR-SERVICE.onrender.com/api/v1/health
# {"ok":true}
```

### 5. Point clients at the API

- Mobile: `EXPO_PUBLIC_API_URL=https://YOUR-SERVICE.onrender.com`
- Web: set API base URL in build env / proxy

**Note:** Free tier sleeps after ~15 min idle; first request may take 30–60s.

## Production deploy

1. Set `NODE_ENV=production`
2. Run `npm run build && npm start`
3. Point `CORS_ORIGIN` at your web app URL (e.g. `https://app.spacehaat.in`)
4. Use MongoDB Atlas + S3 in production

Pairs with `apps/web` (browser) and `apps/mobile` (Expo).
