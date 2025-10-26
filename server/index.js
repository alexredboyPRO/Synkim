const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", // allow all origins for testing
    methods: ["GET", "POST"],
  },
});

// --- socket events ---
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Play event
  socket.on("play", (time) => {
    socket.broadcast.emit("play", time);
  });

  // Pause event
  socket.on("pause", (time) => {
    socket.broadcast.emit("pause", time);
  });

  // Sync event
  socket.on("sync", (time) => {
    socket.broadcast.emit("sync", time);
  });

  // Change video event
  socket.on("changeVideo", (newId) => {
    socket.broadcast.emit("changeVideo", newId);
  });

  // Change playlist event
  socket.on("changePlaylist", (newPlaylistId) => {
    socket.broadcast.emit("changePlaylist", newPlaylistId);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

// --- start server ---
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));