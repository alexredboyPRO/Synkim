// server/index.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

io.on("connection", socket => {
  console.log("sock connected:", socket.id);

  socket.on("join_room", room => {
    socket.join(room);
    console.log(`${socket.id} joined ${room}`);
  });

  socket.on("sync_action", data => {
    console.log("sync_action from", socket.id, data);
    io.to(data.room).emit("sync_action", { action: data.action, time: data.time });
  });

  socket.on("disconnect", () => {
    console.log("disconnect:", socket.id);
  });
});

const PORT = 3001;
server.listen(PORT, () => console.log("Server listening on", PORT));
