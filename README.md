# 🌐 Apna Video Call (Zoom Clone)

<p align="center">
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express.js" />
  <img src="https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white" alt="MongoDB" />
  <img src="https://img.shields.io/badge/Socket.io-010101?style=for-the-badge&logo=socketdotio&logoColor=white" alt="Socket.io" />
  <img src="https://img.shields.io/badge/WebRTC-333333?style=for-the-badge&logo=webrtc&logoColor=white" alt="WebRTC" />
  <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" />
</p>

A premium, high-fidelity, real-time video conferencing platform built on a modern **WebRTC P2P mesh architecture**. Features an interactive pre-meeting lobby, seamless screen-sharing, instant text chat, and a stunning orientation-aware glassmorphic interface designed to offer a state-of-the-art virtual collaboration experience.

---

## 🌟 Core Features

*   **⚡ Ultra-Low Latency Streaming**: Native peer-to-peer audio & video transmission powered by WebRTC (`RTCPeerConnection`) with Socket.io signaling.
*   **🔒 Permissions Guard Lobby**: Intelligently inspects microphone and camera hardware before entrance. Guides and re-prompts the user inline if permission is denied, avoiding messy page refreshes.
*   **🖥️ Seamless Screen Sharing**: Instant, one-click screen sharing using WebRTC track replacement so other participants never lose connection.
*   **📱 Orientation-Aware UI**: Responsive layouts tailored for mobile, tablet, and desktop screens. Dynamically detects orientation changes (landscape vs. portrait on phones) and repositions elements (self-view PiP, control bar) for the best viewing angle.
*   **💬 In-Meet Chat Room**: Threaded messaging panel with dynamic notification badges so you don't miss text updates while talking.
*   **✨ Space-Dark Glassmorphic Theme**: Designed with custom HSL-tailored gradients, subtle CSS micro-animations, hover scaling, dynamic viewports (`100dvh`), and proper safe-area padding for iOS notches.

---

## 🛠️ Tech Stack & Architecture

| Layer | Technologies | Role |
| :--- | :--- | :--- |
| **Frontend** | React, Vite, Material UI (MUI), Axios | UI Components, State Management & Build Tool |
| **Backend** | Node.js, Express.js, MongoDB Atlas, Mongoose | REST API, Database Models & Core Web Server |
| **Real-Time** | WebRTC, Socket.io | Signaling & Peer-to-Peer Media Streams |
| **Security** | Bcrypt (10 rounds), JSON Web Tokens (JWT) | Password Hashing & Authenticated Session Routing |

### 📊 Signaling & P2P Media Flow

The diagram below details how clients register with the backend via WebSockets (Socket.io) to exchange WebRTC offer/answer session descriptions (SDP) and ICE candidates, establishing a direct peer-to-peer audio/video connection.

```mermaid
sequenceDiagram
    participant A as Client A (React)
    participant S as Server (Socket.io)
    participant B as Client B (React)

    Note over A,B: 1. Signaling phase (Socket.io connection)
    A->>S: join-call (Meeting ID)
    B->>S: join-call (Meeting ID)
    S-->>A: user-joined (Client B socket ID)
    
    Note over A,B: 2. WebRTC Peer Connection Setup
    A->>A: Create RTCPeerConnection & Add Media Tracks
    A->>S: send-signal (Offer, Target: Client B)
    S-->>B: receive-signal (Offer from Client A)
    B->>B: Create RTCPeerConnection & Add Media Tracks
    B->>B: Set Remote Description (Offer)
    B->>B: Create Answer
    B->>S: send-signal (Answer, Target: Client A)
    S-->>A: receive-signal (Answer from Client B)
    A->>A: Set Remote Description (Answer)
    
    Note over A,B: 3. ICE Candidate Exchange & P2P Stream Established
    A->>S: ice-candidate (to Client B)
    S-->>B: ice-candidate (from Client A)
    B->>S: ice-candidate (to Client A)
    S-->>A: ice-candidate (from Client B)
    Note over A,B: Direct WebRTC P2P Channel Opened! 🎉
```

---

## ⚙️ Installation & Configuration

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+ recommended)
- A [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) cluster (or local MongoDB database instance)

### Quick Start Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/sanjaynayak1224/Video_Conferencing_Platform.git
   cd Video_Conferencing_Platform
   ```

2. **Configure Backend Environment**:
   Create a `.env` file in the `/backend` folder:
   ```env
   PORT=8080
   MONGO_URL=mongodb+srv://<username>:<password>@cluster.mongodb.net/apnavideocall
   ```

3. **Install Dependencies & Start the Servers**:

   - **Start the Backend API Server**:
     ```bash
     cd backend
     npm install
     npm run dev
     ```

   - **Start the React Frontend Client**:
     ```bash
     cd ../frontend
     npm install
     npm run dev
     ```

4. **Access the application**:
   Open `http://localhost:5173` in your browser. Open multiple windows/tabs or join from another device to start video conferencing!

---

## 🎨 Visual Details & Layout Optimization

- **Self-view Mirroring**: Built-in mirrored scaling (`transform: scaleX(-1)`) for local video inputs, making it look natural to users (remote views remain correctly unmirrored).
- **Mobile Viewport Fix (`100dvh`)**: Avoids the classic mobile layout issues where address bars crop control buttons.
- **Dynamic CSS Video Grid**:
  - **1 User**: Full screen.
  - **2 Users**: 50/50 split layout.
  - **3-4 Users**: Balanced 2x2 grid.
  - **5+ Users**: Scrollable auto-rows view.
