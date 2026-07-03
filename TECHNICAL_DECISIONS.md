# Technical Decisions

This document explains the reasoning behind key technology and architecture choices in this project.

---

## Why WebRTC (Mesh Topology)

**Decision**: Direct peer-to-peer media streams using WebRTC's mesh topology.

**Reasoning**: For a small-group video conferencing app (2–6 participants), mesh avoids the cost and complexity of a media server (SFU/MCU). Each peer sends their media directly to every other peer, which means:

- No media server infrastructure needed
- Lower latency (no server hop for media)
- Simpler deployment — only the signaling server needs to be hosted

**Trade-offs**: Mesh doesn't scale beyond ~6 participants because each peer must encode and send N-1 separate streams. For a portfolio project demonstrating WebRTC fundamentals, this is the right balance of complexity vs. demonstrable engineering.

**If scaling further**: Migrate to an SFU (Selective Forwarding Unit) like mediasoup or Janus. The signaling layer is already decoupled, so the migration would primarily affect the `useWebRTC` hook's peer connection management.

---

## Why Socket.io

**Decision**: Socket.io for real-time signaling and chat.

**Reasoning**:
- Built-in room management (`socket.join`, `io.to(room)`) maps naturally to meeting rooms
- Automatic reconnection with configurable backoff — critical for mobile users switching networks
- Transport fallback (WebSocket → polling) handles corporate firewalls that block WebSocket
- Namespace isolation possible for future feature separation

**Alternatives considered**:
- **Raw WebSocket**: Lower overhead but no reconnection, rooms, or transport fallback out of the box
- **Firebase Realtime DB**: Would add a dependency and latency to the signaling path
- **WebRTC Data Channels**: Chicken-and-egg problem — need signaling to establish the data channel in the first place

---

## Why MongoDB

**Decision**: MongoDB (via Mongoose) for user accounts and meeting history.

**Reasoning**:
- Meeting history records have a simple, flat structure that doesn't benefit from relational joins
- Schema flexibility allows adding fields (like `duration`, `leftAt`) without migrations
- MongoDB Atlas provides free-tier hosting with global replication, good for a portfolio deployment
- Mongoose provides schema validation, type casting, and query building

**Trade-offs**: For a production system with complex querying needs (e.g., analytics across meetings, user relationships), PostgreSQL would be more appropriate. For this project's scope, MongoDB keeps things simple.

---

## Why Stateless JWT Authentication

**Decision**: Stateless JWTs stored in localStorage, verified server-side without database lookups.

**Reasoning**:
- Each request is independently verifiable by checking the JWT signature
- No session store needed — simplifies horizontal scaling
- 7-day expiry balances security with user convenience

**Trade-offs**:
- Tokens can't be individually revoked without a blacklist (not implemented — acceptable for this scope)
- localStorage is vulnerable to XSS (mitigated by Helmet CSP headers and input sanitization)

**Alternative**: HTTP-only cookies with CSRF tokens would be more secure for a production app, but adds complexity that obscures the authentication flow for portfolio demonstration purposes.

---

## Why Custom React Hook for WebRTC

**Decision**: All WebRTC logic lives in a single `useWebRTC` hook.

**Reasoning**:
- Isolates ~640 lines of complex async, stateful WebRTC/Socket.io logic from the UI layer
- The VideoMeet component stays focused on rendering (~300 lines of JSX)
- Hook can be independently tested or replaced without touching the UI
- Follows React's composition model — hook manages connections, component manages presentation

**Alternative**: A context-based approach or a state machine (XState) could manage the WebRTC lifecycle more formally. The hook approach was chosen for simplicity and to demonstrate proficiency with React's hooks API.

---

## Why Centralized Configuration

**Decision**: Single `config.js` module that validates and exports all environment-dependent values.

**Reasoning**:
- The JWT secret was previously hardcoded as a fallback in 3 separate files — a security and maintenance risk
- Fail-fast validation on startup prevents silent misconfiguration
- Any developer can look at one file to understand all configurable parameters

---

## iOS Safari Compatibility

**Decision**: Joint single-shot `getUserMedia` call with sequential fallback.

**Reasoning**: iOS WebKit has a documented bug where sequential `getUserMedia` calls (first video, then audio) cause hardware permission locks that result in black screens or frozen frames. By requesting both video and audio in a single call, we avoid this WebKit-specific issue. The sequential fallback handles cases where one device is unavailable.

---

## Active Speaker Detection

**Decision**: Web Audio API frequency analysis with debounced timeout.

**Reasoning**: Rather than relying on server-side audio level detection (which would require routing media through the server), we analyze audio frequency data client-side using `AnalyserNode`. This:
- Works with the P2P mesh topology (no server media access needed)
- Adds minimal CPU overhead (200ms polling interval, small FFT buffer)
- Provides real-time visual feedback without any backend changes

The 2.5-second silence debounce prevents the speaker highlight from flickering during natural speech pauses.
