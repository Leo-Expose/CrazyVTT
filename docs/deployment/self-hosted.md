# CozyVTT Self-Hosted Deployment Guide (PRD §20)

This guide documents setting up and running your own production-ready instance of CozyVTT using Docker Compose, PostgreSQL, S3-compatible asset storage (MinIO or AWS S3), and Socket.io WebSockets.

---

## 1. Prerequisites

- A Linux host (Ubuntu 22.04 LTS or Debian 12 recommended)
- Docker Engine >= 24.0 and Docker Compose >= 2.20
- A registered domain name or subdomain (e.g. `vtt.example.com`)
- A reverse proxy with TLS certificate (Caddy, Nginx, or Traefik)

---

## 2. Architecture Overview

```
                        HTTPS / WSS (:443)
                                │
                        ┌───────▼───────┐
                        │ Nginx / Caddy │
                        └───────┬───────┘
                                │
        ┌───────────────────────┴───────────────────────┐
        │                                               │
 ┌──────▼──────┐                                 ┌──────▼──────┐
 │  Frontend   │                                 │   Backend   │
 │ (Static/SPA)│                                 │ (Node/TS API│
 │   Port 80   │                                 │ + WebSocket)│
 └─────────────┘                                 │  Port 3001  │
                                                 └──────┬──────┘
                                                        │
                         ┌──────────────────────────────┴──────────────────────────────┐
                         │                                                             │
                  ┌──────▼──────┐                                               ┌──────▼──────┐
                  │ PostgreSQL  │                                               │ S3 / MinIO  │
                  │   Port 5432 │                                               │   Port 9000 │
                  └─────────────┘                                               └─────────────┘
```

---

## 3. Quick Start with Docker Compose

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-org/CozyVTT.git
   cd CozyVTT
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and configure:
   - `JWT_SECRET`: Random 64-character secret
   - `DATABASE_URL`: `postgresql://cozyvtt:your_password@postgres:5432/cozyvtt?schema=public`
   - `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`
   - `FRONTEND_URL`: Public HTTPS URL of your frontend (e.g., `https://vtt.example.com`)

3. **Launch all services:**
   ```bash
   docker compose up -d
   ```

4. **Run database migrations:**
   ```bash
   docker compose exec backend npx prisma migrate deploy
   ```

5. **Verify health:**
   ```bash
   curl http://localhost:3001/health
   ```

---

## 4. Production Security Checklist

- [ ] Change all default passwords in `.env`
- [ ] Restrict database port `5432` and MinIO console port `9001` to internal network
- [ ] Enforce HTTPS on reverse proxy for both HTTP and WebSocket (`wss://`) traffic
- [ ] Set `NODE_ENV=production`
- [ ] Configure automatic daily PostgreSQL backups (see `backup_live_*.sql`)
- [ ] Ensure AGPL v3 license notice is preserved in the application footer
