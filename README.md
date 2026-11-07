# PixelStar V1

A full-stack messaging starter with:
- React + Vite frontend
- Express API
- SQLite persistence
- JWT authentication with bcrypt password hashing
- Socket.IO real-time messaging
- Cosmic Dark / Light / Auto theme
- Responsive ArtCraft-inspired editorial UI

## Requirements
- Node.js 20+
- npm

## Run locally

Open two terminals.

### 1. Backend
```bash
cd server
cp .env.example .env
npm install
npm run dev
```
API runs at http://localhost:4000

### 2. Frontend
```bash
cd client
npm install
npm run dev
```
Open http://localhost:5173

Vite proxies `/api` and `/socket.io` to the backend.

## First use
Register an account. To test real-time messaging, open the site in a second browser/private window and register a second account. Search for the other username in the New conversation field.

## Important
This is a runnable development foundation, not a production deployment. Before public launch:
- Set a long random JWT_SECRET.
- Use HTTPS and secure cookies or a carefully managed token strategy.
- Configure CORS to your exact production domain.
- Add email verification, password reset, rate limiting, abuse reporting, moderation, backups and monitoring.
- Use PostgreSQL for a multi-instance production deployment; SQLite is intended for local/single-instance use.
- Add file/object storage before enabling image and file uploads.

Passwords are hashed with bcrypt. The server never stores plaintext passwords.
