# Contributing

Thanks for your interest in contributing to Apna Video Call! This guide covers how to set up the project locally and submit changes.

---

## Prerequisites

- **Node.js** v18+ (tested on v20/v22)
- **MongoDB** — local daemon or [MongoDB Atlas](https://www.mongodb.com/atlas) cluster
- **Git**

---

## Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/sanjaynayak1224/Video_Conferencing_Platform.git
   cd Video_Conferencing_Platform
   ```

2. **Configure environment variables**

   ```bash
   cp backend/.env.example backend/.env
   ```

   Fill in your MongoDB connection string and a JWT secret in `backend/.env`.

3. **Install dependencies**

   ```bash
   cd backend && npm install
   cd ../frontend && npm install
   ```

4. **Start development servers**

   ```bash
   # Terminal 1 — Backend
   cd backend && npm run dev

   # Terminal 2 — Frontend
   cd frontend && npm run dev
   ```

   Open `http://localhost:5173` to access the app. The frontend dev server also exposes on your LAN for multi-device testing.

---

## Project Structure

```
├── backend/
│   └── src/
│       ├── app.js               — Server bootstrap
│       ├── config.js            — Environment config
│       ├── controllers/         — Route handlers + socket events
│       ├── middleware/          — Auth middleware
│       ├── models/             — Mongoose schemas
│       └── routes/             — Express route definitions
├── frontend/
│   └── src/
│       ├── App.jsx             — Router + provider setup
│       ├── context/            — React contexts
│       ├── hooks/              — Custom hooks (useWebRTC)
│       ├── pages/              — Page components
│       ├── styles/             — Component CSS files
│       ├── utils/              — HOCs and utilities
│       └── environment.js      — API base URL config
├── ARCHITECTURE.md
├── TECHNICAL_DECISIONS.md
└── CHANGELOG.md
```

---

## Coding Conventions

- **Naming**: `camelCase` for variables/functions, `PascalCase` for components, `kebab-case` for CSS classes
- **Comments**: Only comment *why*, not *what*. No comments on obvious code.
- **Imports**: Group by external packages first, then internal modules
- **State**: Keep state as local as possible. Only lift to context when multiple components need it.
- **Error handling**: Always handle errors. Never ignore catch blocks.

---

## Contribution Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Make your changes
4. Run the linter: `cd frontend && npm run lint`
5. Build to verify: `cd frontend && npm run build`
6. Commit with a descriptive message: `git commit -m "Add: meeting duration timer in control bar"`
7. Push and open a Pull Request

---

## Commit Message Format

Use a prefix to categorize the change:

- `Add:` — New feature
- `Fix:` — Bug fix
- `Refactor:` — Code improvement without behavior change
- `Docs:` — Documentation only
- `Style:` — CSS / formatting changes
- `Security:` — Security-related fix
