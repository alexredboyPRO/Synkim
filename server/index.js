const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("play", (data) => {
    socket.broadcast.emit("play", data);
  });

  socket.on("pause", (data) => {
    socket.broadcast.emit("pause", data);
  });

  socket.on("sync", (data) => {
    socket.broadcast.emit("sync", data);
  });

  socket.on("changeVideo", (newId) => {
    socket.broadcast.emit("changeVideo", newId);
  });

  socket.on("changePlaylist", (newPlaylistId) => {
    socket.broadcast.emit("changePlaylist", newPlaylistId);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));