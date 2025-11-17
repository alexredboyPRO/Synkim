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

// Store room state
const rooms = new Map();

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  let currentRoom = "default";

  // Join room and get current state
  socket.on("joinRoom", (roomId = "default") => {
    currentRoom = roomId;
    socket.join(roomId);
    
    // Initialize room if it doesn't exist
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        videoId: "dQw4w9WgXcQ",
        playlistId: "",
        isPlaylist: false,
        isPlaying: false,
        currentTime: 0,
        lastUpdate: Date.now()
      });
    }
    
    const room = rooms.get(roomId);
    // Send current room state to the new user
    socket.emit("roomState", room);
    console.log(`User ${socket.id} joined room: ${roomId}`, room);
  });

  // Play event with room awareness
  socket.on("play", (data) => {
    const room = rooms.get(currentRoom);
    if (room) {
      room.isPlaying = true;
      room.currentTime = data.time;
      room.lastUpdate = Date.now();
      
      // Broadcast to others in the same room
      socket.to(currentRoom).emit("play", data);
      console.log(`Play in room ${currentRoom} at time ${data.time}`);
    }
  });

  // Pause event with room awareness
  socket.on("pause", (data) => {
    const room = rooms.get(currentRoom);
    if (room) {
      room.isPlaying = false;
      room.currentTime = data.time;
      room.lastUpdate = Date.now();
      
      socket.to(currentRoom).emit("pause", data);
      console.log(`Pause in room ${currentRoom} at time ${data.time}`);
    }
  });

  // Sync event - only update time, don't change play state
  socket.on("sync", (data) => {
    const room = rooms.get(currentRoom);
    if (room) {
      room.currentTime = data.time;
      room.lastUpdate = Date.now();
      
      socket.to(currentRoom).emit("sync", data);
    }
  });

  // Change video event
  socket.on("changeVideo", (data) => {
    const room = rooms.get(currentRoom);
    if (room) {
      room.videoId = data.videoId;
      room.playlistId = "";
      room.isPlaylist = false;
      room.isPlaying = false;
      room.currentTime = 0;
      room.lastUpdate = Date.now();
      
      socket.to(currentRoom).emit("changeVideo", data);
      console.log(`Video changed in room ${currentRoom} to ${data.videoId}`);
    }
  });

  // Change playlist event
  socket.on("changePlaylist", (data) => {
    const room = rooms.get(currentRoom);
    if (room) {
      room.playlistId = data.playlistId;
      room.videoId = "";
      room.isPlaylist = true;
      room.isPlaying = false;
      room.currentTime = 0;
      room.lastUpdate = Date.now();
      
      socket.to(currentRoom).emit("changePlaylist", data);
      console.log(`Playlist changed in room ${currentRoom} to ${data.playlistId}`);
    }
  });

  // Get current room state
  socket.on("getRoomState", () => {
    const room = rooms.get(currentRoom);
    if (room) {
      socket.emit("roomState", room);
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

// Clean up old rooms periodically
setInterval(() => {
  const now = Date.now();
  const tenMinutes = 10 * 60 * 1000;
  
  for (const [roomId, room] of rooms.entries()) {
    if (now - room.lastUpdate > tenMinutes) {
      rooms.delete(roomId);
      console.log(`Cleaned up old room: ${roomId}`);
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));