import { Server } from "socket.io";

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
            timeOnline[socket.id] = new Date();

            // Fetch list of client IDs in this native room
            const clients = Array.from(io.sockets.adapter.rooms.get(path) || []);

            // Map IDs to username metadata
            const clientList = clients.map(clientId => {
                const clientSocket = io.sockets.sockets.get(clientId);
                return {
                    socketId: clientId,
                    username: clientSocket?.username || "Guest"
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
