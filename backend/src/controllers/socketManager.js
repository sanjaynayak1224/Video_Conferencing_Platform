import { Server } from "socket.io";
import { Meeting } from "../models/meeting.model.js";
import jwt from "jsonwebtoken";
import config from "../config.js";

let messages = {};

export const connectToSocket = (server) => {
    const io = new Server(server, {
        cors: {
            origin: config.corsOrigin,
            methods: ["GET", "POST"],
            allowedHeaders: ["*"]
        }
    });

    io.on("connection", (socket) => {
        console.log("[Socket] Connected:", socket.id);

        socket.on("join-call", (path, username) => {
            socket.join(path);
            socket.room = path;
            socket.username = username || "Guest";
            socket.mediaState = { video: false, audio: false };

            // Authenticate socket to map database session logs
            const token = socket.handshake.auth?.token;
            if (token) {
                try {
                    const decoded = jwt.verify(token, config.jwtSecret);
                    socket.user_id = decoded.username;
                    socket.joinedAt = new Date();

                    const newMeeting = new Meeting({
                        user_id: socket.user_id,
                        meetingCode: path.replace(/^\//, ""),
                        date: socket.joinedAt,
                        joinedAt: socket.joinedAt
                    });
                    newMeeting.save()
                        .then(doc => {
                            socket.meetingLogId = doc._id;
                            console.log(`[Socket DB] Saved meeting log: ${doc._id}`);
                        })
                        .catch(e => console.error("[Socket DB] Error saving log:", e));
                } catch (e) {
                    console.warn("[Socket Auth] Token verification failed:", e.message);
                }
            }

            const clients = Array.from(io.sockets.adapter.rooms.get(path) || []);

            const clientList = clients.map(clientId => {
                const clientSocket = io.sockets.sockets.get(clientId);
                return {
                    socketId: clientId,
                    username: clientSocket?.username || "Guest",
                    mediaState: clientSocket?.mediaState || { video: false, audio: false }
                };
            });

            console.log(`[Socket] ${socket.username} (${socket.id}) joined room ${path}. Peers: ${clientList.length}`);

            io.to(path).emit("user-joined", socket.id, clientList);

            // Replay chat history to the newly connected user
            if (messages[path]) {
                messages[path].forEach((msg) => {
                    io.to(socket.id).emit("chat-message", msg.data, msg.sender, msg.socketId, msg.timestamp);
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
            const room = socket.room;
            if (!room) return;

            if (!messages[room]) {
                messages[room] = [];
            }

            const chatEntry = {
                sender,
                data,
                socketId: socket.id,
                timestamp: new Date().toISOString()
            };

            messages[room].push(chatEntry);

            // Cap message history to prevent unbounded memory growth
            if (messages[room].length > config.maxMessagesPerRoom) {
                messages[room] = messages[room].slice(-config.maxMessagesPerRoom);
            }

            io.to(room).emit("chat-message", data, sender, socket.id, chatEntry.timestamp);
        });

        socket.on("disconnect", () => {
            console.log("[Socket] Disconnected:", socket.id);

            const roomKey = socket.room;
            if (!roomKey) return;

            socket.to(roomKey).emit("user-left", socket.id);

            // Update meeting duration on disconnect
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
                    .then(() => console.log(`[Socket DB] Updated duration for: ${socket.meetingLogId}`))
                    .catch(e => console.error("[Socket DB] Error updating log:", e));
            }

            // Purge message cache when room empties
            const roomExists = io.sockets.adapter.rooms.has(roomKey);
            if (!roomExists) {
                console.log(`[Socket] Room ${roomKey} empty. Purging message cache.`);
                delete messages[roomKey];
            }
        });
    });

    return io;
};
