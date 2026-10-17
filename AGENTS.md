# Repository Guidelines

## Project Structure & Module Organization

This repository is a two-part video conferencing app. `backend/` contains the Node.js, Express, MongoDB, Socket.io, and WebRTC signaling server. Backend source lives in `backend/src/`: `controllers/` for HTTP/socket handlers, `models/` for Mongoose schemas, `middleware/` for auth, and `routes/` for API routing. `frontend/` contains the React/Vite client. Frontend source lives in `frontend/src/`, with `pages/`, `context/`, `hooks/`, `utils/`, and CSS under `styles/`. Static assets are in `frontend/public/`. Do not edit build output such as `frontend/dist/` or dependency folders.

## Build, Test, and Development Commands

Install dependencies separately in each app:

```bash
cd backend && npm install
cd ../frontend && npm install
```

Run the backend dev server on port `8080`:

```bash
cd backend && npm run dev
```

Run the frontend Vite server on port `5173`:

```bash
cd frontend && npm run dev
```

Other useful commands: `cd backend && npm start` for production-style backend startup, `cd frontend && npm run build` for the production bundle, `cd frontend && npm run preview` to inspect it, and `cd frontend && npm run lint` to run ESLint.

## Coding Style & Naming Conventions

Use ES modules throughout. Follow existing React patterns with `PascalCase` component files, `camelCase` functions and variables, and descriptive `kebab-case` CSS class names. Keep imports grouped by external packages first, then local modules. Prefer concise functions, localized state, and context only when multiple components need shared data. Frontend linting is configured in `frontend/eslint.config.js`.

## Testing Guidelines

No automated test runner or coverage threshold is configured yet. Before submitting changes, run `npm run lint` and `npm run build` in `frontend/`, then manually verify affected flows such as registration/login, meeting join, camera/mic toggles, chat, screen sharing, and meeting history. If adding tests, place them near the component, hook, route, or controller being covered.

## Commit & Pull Request Guidelines

Recent git history is not descriptive, so use the project convention from `CONTRIBUTING.md`: prefix commits with `Add:`, `Fix:`, `Refactor:`, `Docs:`, `Style:`, or `Security:`. Keep each commit focused. Pull requests should include a short summary, linked issue when applicable, screenshots for UI changes, environment/config notes, and the commands or manual flows used for verification.

## Security & Configuration Tips

Copy `backend/.env.example` to `backend/.env` and keep secrets out of git. Required values include `PORT`, `MONGO_URL`, `JWT_SECRET`, and `CORS_ORIGIN`. Avoid logging JWTs, passwords, MongoDB URLs, or user media metadata.
