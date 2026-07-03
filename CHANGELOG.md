# Changelog

All notable changes to this project are documented in this file.

---

## [1.0.0] — 2026-07-03

### Security
- Centralized JWT secret configuration — eliminated hardcoded fallback strings from 3 files
- Added input validation on user registration (name, username length, password strength)
- Added meeting code validation and sanitization
- Removed unused `crypto` npm package (known supply chain risk)
- Moved `nodemon` from production to dev dependencies
- Created `.env.example` template (prevents accidental credential exposure)
- Added comprehensive `.gitignore` covering env files, OS artifacts, IDE files

### Bug Fixes
- **Fixed self-video not displaying**: Resolved race condition between callback ref re-assignment and `srcObject` binding during lobby → meeting room transition. Video element now eagerly binds the stream on mount via memoized callback ref.
- **Fixed setState during render**: Moved page clamping logic from render phase into `useEffect` to prevent React warnings.
- **Fixed infinite re-render loop**: Memoized `AuthContext` value object and handler functions with `useMemo`/`useCallback`. Previously, `History.jsx` would infinitely re-fetch because `getHistoryOfUser` was recreated on every render.
- **Fixed premature protected component render**: `WithAuth` HOC now returns `null` until auth verification completes, preventing flash of protected content before redirect.
- **Fixed HTTP status code for duplicate user**: Changed from 302 (Found) to 409 (Conflict).
- **Removed unnecessary DB write on login**: Stopped saving JWT token to user document (stateless auth doesn't need it).

### Features
- **Meeting duration timer**: Live timer displayed in the meeting info bar during calls
- **Participant count indicator**: Shows current number of participants in the meeting
- **Keyboard shortcuts**: M (toggle mic), V (toggle video), Esc (close chat)
- **Chat auto-scroll**: Chat panel automatically scrolls to latest message
- **Copy meeting link**: Button in lobby to copy the meeting URL to clipboard
- **Chat message bubbles**: Improved chat styling with sender highlighting
- **Loading state for history**: Spinner while fetching meeting history, error state on failure
- **Toast notifications**: Replaced `alert()` with Material UI Snackbar throughout
- **Chat timestamps**: Server-side timestamps added to chat messages
- **Message cache cap**: Server-side limit of 500 messages per room prevents unbounded memory growth

### Code Quality
- Centralized backend config module (`config.js`) with fail-fast env var validation
- Consistent naming (`navigate` instead of mixed `router`/`routeTo`/`navigate`)
- Fixed `let` → `const` across Authentication, HomeComponent, and other files
- Removed debug `console.log` calls from production code paths
- Added `timestamps: true` to Mongoose schemas
- Added `trim`/`lowercase` on username field for data consistency
- Added Enter key support on login password field and meeting code input
- Added descriptive `alt` text on images for accessibility
- Added `title` attributes on control buttons for discoverability
- Proper HTML meta tags (title, description, theme-color)
- Fixed favicon reference to use existing `logo.svg`

### Architecture
- Added explicit `disconnect()` method to `useWebRTC` for clean call teardown
- Added graceful SIGTERM shutdown handler to backend
- Removed unused `timeOnline` object from socket manager
- Removed `token` field from User schema (unnecessary for stateless JWT)

### Documentation
- Created `ARCHITECTURE.md` with system overview, component tree, signaling flow diagrams, and database schema
- Created `TECHNICAL_DECISIONS.md` explaining engineering choices and trade-offs
- Created `CONTRIBUTING.md` with setup instructions and coding conventions
- Created `CHANGELOG.md`
- Added MIT `LICENSE`
- Rewrote `README.md` with comprehensive project documentation
