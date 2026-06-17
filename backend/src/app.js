import express from "express";
import {createServer} from "node:http";
import  dotenv from "dotenv"
dotenv.config()

import mongoose from "mongoose";
import {connectToSocket} from "./controllers/socketManagar.js"

import cors from "cors";
import userRoutes from "./routes/users.routes.js";


const app=express();
const server=createServer(app);
const io=connectToSocket(server);

app.set("port",(process.env.PORT)|| 8080);
app.use(cors())
app.use(express.json({limit:"40kb"}));
app.use(express.urlencoded({limit:"40kb",extended:true}));
app.use("/api/v1/users",userRoutes)


const start=async()=>{
   const connectionDb=await mongoose.connect(process.env.MONGO_URL)
   console.log(`Database connected successfully: ${connectionDb.connection.host}`);
   server.listen(app.get("port"),()=>{
      console.log(`Server listening on port ${app.get("port")}`);
   })
}

start();
