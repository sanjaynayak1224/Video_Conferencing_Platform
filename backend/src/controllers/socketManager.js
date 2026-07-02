import { Server } from "socket.io";
import { Meeting } from "../models/meeting.model.js";
import jwt from "jsonwebtoken";

let messages = {};
let timeOnline = {};

export const connectToSocket = (server) => {
    const io = new Server(server, {
        cors: {
            origin: process.env.CORS_ORIGIN || "*",
            methods: ["GET", "POST"],
            allowedHeaders: ["*"]
        }
    });

    io.on("connection", (socket) => {
        console.log("[Socket] Connected:", socket.id);

        socket.on("join-call", (path, username) => {
            // Join native Socket.io room
            socket.join(path);
            socket.room = path;
            socket.username = username || "Guest";
            socket.mediaState = { video: false, audio: false }; // Initial call join states default to off
            timeOnline[socket.id] = new Date();

            // Handshake JWT Auth to map database session logs
            const token = socket.handshake.auth?.token;
            if (token) {
                try {
                    const secret = process.env.JWT_SECRET || "apna_video_call_default_secret_key_2026";
                    const decoded = jwt.verify(token, secret);
                    socket.user_id = decoded.username;
                    socket.joinedAt = new Date();
                    console.log(`[Socket Auth] Mapping authenticated user: ${socket.user_id}`);

                    // Save initial meeting entry immediately on join
                    const newMeeting = new Meeting({
                        user_id: socket.user_id,
                        meetingCode: path.replace(/^\//, ""),
                        date: socket.joinedAt,
                        joinedAt: socket.joinedAt
                    });
                    newMeeting.save()
                        .then(doc => {
                            socket.meetingLogId = doc._id;
                            console.log(`[Socket DB] Saved initial meeting log: ${doc._id}`);
                        })
                        .catch(e => console.error("[Socket DB] Error saving initial log:", e));
                } catch (e) {
                    console.warn("[Socket Auth] Token verification failed on room join:", e.message);
                }
            }

            // Fetch list of client IDs in this native room
            const clients = Array.from(io.sockets.adapter.rooms.get(path) || []);

            // Map IDs to username metadata and media states
            const clientList = clients.map(clientId => {
                const clientSocket = io.sockets.sockets.get(clientId);
                return {
                    socketId: clientId,
                    username: clientSocket?.username || "Guest",
                    mediaState: clientSocket?.mediaState || { video: false, audio: false }
                };
            });

            console.log(`[Socket] User ${socket.id} (${socket.username}) joined room ${path}. Clients:`, clientList);

            // Notify everyone in the room (including the joiner) about the updated client metadata list
            io.to(path).emit("user-joined", socket.id, clientList);

            // Replay chat history to the newly connected user
            if (messages[path] !== undefined) {
                messages[path].forEach((msg) => {
                    // Fix: Emitting matching keys so that replayed message lists recognize the sender ID
                    io.to(socket.id).emit("chat-message", msg.data, msg.sender, msg.socketId);
                });
            }
        });

        socket.on("media-toggle", (state) => {
            const room = socket.room;
            if (!room) return;
            socket.mediaState = state;
            socket.to(room).emit("media-toggle", socket.id, state);
        });

        socket.on("signal", (toId, message) => {
            io.to(toId).emit("signal", socket.id, message);
        });

        socket.on("chat-message", (data, sender) => {
            const matchingRoom = socket.room;
            if (!matchingRoom) return;

            if (!messages[matchingRoom]) {
                messages[matchingRoom] = [];
            }

            messages[matchingRoom].push({
                sender: sender,
                data: data,
                socketId: socket.id
            });

            console.log(`[Chat] ${matchingRoom} -> ${sender}: ${data}`);

            // Broadcast message natively to all sockets in the room
            io.to(matchingRoom).emit("chat-message", data, sender, socket.id);
        });

        socket.on("disconnect", () => {
            console.log("[Socket] Disconnected:", socket.id);
            
            const roomKey = socket.room;
            if (!roomKey) return;

            // Notify everyone in that room that the user has left
            socket.to(roomKey).emit("user-left", socket.id);

            // Update meeting history entry duration on socket disconnection
            if (socket.meetingLogId) {
                const leftAt = new Date();
                Meeting.findById(socket.meetingLogId)
                    .then(meeting => {
                        if (meeting) {
                            meeting.leftAt = leftAt;
                            meeting.duration = leftAt - meeting.joinedAt;
                            return meeting.save();
                        }
                    })
                    .then(() => console.log(`[Socket DB] Updated meeting log duration for: ${socket.meetingLogId}`))
                    .catch(e => console.error("[Socket DB] Error updating meeting log:", e));
            }

            // Check if the native room is now empty
            const roomExists = io.sockets.adapter.rooms.has(roomKey);
            if (!roomExists) {
                console.log(`[Socket] Room ${roomKey} is now empty. Purging temporary messages cache.`);
                delete messages[roomKey];
            }

            delete timeOnline[socket.id];
        });
    });

    return io;
};
