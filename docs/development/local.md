# CozyVTT Local Development Setup Guide

This guide walks you through setting up CozyVTT for local development and testing.

---

## 1. Prerequisites

- **Node.js**: >= 20.0.0
- **npm** or **pnpm**
- **Docker & Docker Compose** (for local PostgreSQL and MinIO)

---

## 2. Environment Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-org/CozyVTT.git
   cd CozyVTT
   ```

2. **Start supporting services (Postgres & MinIO):**
   ```bash
   docker compose -f docker-compose.dev.yml up -d
   ```

3. **Backend Setup:**
   ```bash
   cd backend
   cp .env.example .env
   npm install
   npx prisma migrate dev
   npm run dev
   ```
   The backend API will run at `http://localhost:3001`.

4. **Frontend Setup:**
   In a separate terminal:
   ```bash
   cd frontend
   cp .env.example .env
   npm install
   npm run dev
   ```
   The frontend dev server will launch at `http://localhost:5173`.

---

## 3. Running Tests

- **Backend tests:**
  ```bash
  cd backend
  npm test
  ```
- **Frontend tests:**
  ```bash
  cd frontend
  npm test
  ```
