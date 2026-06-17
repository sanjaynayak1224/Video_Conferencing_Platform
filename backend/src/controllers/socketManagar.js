import { Server } from "socket.io";


let connections={};
let messages={};
let timeOnline={};


export const connectToSocket=(server)=>{
    const io=new Server(server,{

        cors:{
            origin:"*",
            methods:["GET","POST"],
            allowedHeaders:["*"],
            credentials:true
        }
    });

    io.on("connection",(socket)=>{

        console.log("Something connected:",socket.id);
        socket.on("join-call",(path)=>{

            if(connections[path]===undefined){
                connections[path]=[];
            }

            connections[path].push(socket.id);

            timeOnline[socket.id]=new Date();

            for(let a=0;a<connections[path].length;a++){
                io.to(connections[path][a]).emit("user-joined",socket.id,connections[path]);
            }

            if(messages[path]!==undefined){
                for(let a=0;a<messages[path].length;a++){
                    io.to(socket.id).emit("chat-message",messages[path][a]['data'],messages[path][a]['sender'],messages[path][a]['socket-id-sender']);
                }
            }

        })

        socket.on("signal",(toId,message)=>{
            io.to(toId).emit("signal",socket.id,message);
        })

        socket.on("chat-message", (data, sender) => {

            let matchingRoom = null;

            // find which room user belongs to
            for (let room in connections) {
                if (connections[room].includes(socket.id)) {
                    matchingRoom = room;
                    break;
                }
            }

            // if user not in room → stop
            if (!matchingRoom) return;

            // initialize messages array
            if (!messages[matchingRoom]) {
                messages[matchingRoom] = [];
            }

            // store message
            messages[matchingRoom].push({
                sender: sender,
                data: data,
                socketId: socket.id
            });

            console.log("message", matchingRoom, ":", sender, data);

            // send message to all users in room
            connections[matchingRoom].forEach((id) => {
                io.to(id).emit("chat-message", data, sender, socket.id);
            });
        });

        socket.on("disconnect", () => {
            console.log("User disconnected:", socket.id);

            let roomKey = null;

            // 1️⃣ Find which room the user belongs to
            for (let room in connections) {
                if (connections[room].includes(socket.id)) {
                    roomKey = room;
                    break;
                }
            }

            // 2️⃣ If user not found in any room → stop
            if (!roomKey) return;

            // 3️⃣ Notify all users in that room
            connections[roomKey].forEach((id) => {
                io.to(id).emit("user-left", socket.id);
            });

            // 4️⃣ Remove user from room
            connections[roomKey] =
                connections[roomKey].filter(id => id !== socket.id);

            // 5️⃣ Delete room if empty
            if (connections[roomKey].length === 0) {
                delete connections[roomKey];
                delete messages[roomKey];
            }

            // 6️⃣ Cleanup time tracking
            delete timeOnline[socket.id];
        });
    })

    return io;
}
