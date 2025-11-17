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

// Store room states
const roomStates = new Map();
const userRooms = new Map();

// Default room state
const defaultRoomState = {
  mediaType: "video", // 'video' or 'playlist'
  mediaId: "dQw4w9WgXcQ", // default video
  isPlaying: false,
  currentTime: 0,
  lastUpdate: Date.now()
};

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Join default room
  const roomId = "default";
  socket.join(roomId);
  userRooms.set(socket.id, roomId);

  // Initialize room if it doesn't exist
  if (!roomStates.has(roomId)) {
    roomStates.set(roomId, { ...defaultRoomState });
  }

  const roomState = roomStates.get(roomId);

  // Send current state to new user
  socket.emit("stateUpdate", {
    mediaType: roomState.mediaType,
    mediaId: roomState.mediaId,
    isPlaying: roomState.isPlaying,
    currentTime: roomState.currentTime,
    isNewUser: true
  });

  console.log(`User ${socket.id} joined room ${roomId}`, roomState);

  // Play event - update room state and broadcast
  socket.on("play", (data) => {
    const { time, isPlaylist, mediaId } = data;
    const roomId = userRooms.get(socket.id);
    const roomState = roomStates.get(roomId);

    // Update room state
    roomState.mediaType = isPlaylist ? "playlist" : "video";
    roomState.mediaId = mediaId;
    roomState.isPlaying = true;
    roomState.currentTime = time;
    roomState.lastUpdate = Date.now();

    // Broadcast to all other users in the room
    socket.to(roomId).emit("play", {
      time: time,
      isPlaylist: isPlaylist,
      mediaId: mediaId,
      fromServer: true
    });

    console.log(`Room ${roomId} play:`, roomState);
  });

  // Pause event
  socket.on("pause", (data) => {
    const { time, isPlaylist, mediaId } = data;
    const roomId = userRooms.get(socket.id);
    const roomState = roomStates.get(roomId);

    roomState.mediaType = isPlaylist ? "playlist" : "video";
    roomState.mediaId = mediaId;
    roomState.isPlaying = false;
    roomState.currentTime = time;
    roomState.lastUpdate = Date.now();

    socket.to(roomId).emit("pause", {
      time: time,
      isPlaylist: isPlaylist,
      mediaId: mediaId,
      fromServer: true
    });

    console.log(`Room ${roomId} pause:`, roomState);
  });

  // Sync event (periodic time updates)
  socket.on("sync", (data) => {
    const { time, isPlaylist, mediaId } = data;
    const roomId = userRooms.get(socket.id);
    const roomState = roomStates.get(roomId);

    // Only update if this is the most recent sync (within 2 seconds)
    if (Date.now() - roomState.lastUpdate > 2000) {
      roomState.currentTime = time;
      roomState.lastUpdate = Date.now();
    }
  });

  // Change video event
  socket.on("changeVideo", (newId) => {
    const roomId = userRooms.get(socket.id);
    const roomState = roomStates.get(roomId);

    roomState.mediaType = "video";
    roomState.mediaId = newId;
    roomState.isPlaying = false;
    roomState.currentTime = 0;
    roomState.lastUpdate = Date.now();

    socket.to(roomId).emit("changeVideo", newId);
    console.log(`Room ${roomId} video changed to:`, newId);
  });

  // Change playlist event
  socket.on("changePlaylist", (newPlaylistId) => {
    const roomId = userRooms.get(socket.id);
    const roomState = roomStates.get(roomId);

    roomState.mediaType = "playlist";
    roomState.mediaId = newPlaylistId;
    roomState.isPlaying = false;
    roomState.currentTime = 0;
    roomState.lastUpdate = Date.now();

    socket.to(roomId).emit("changePlaylist", newPlaylistId);
    console.log(`Room ${roomId} playlist changed to:`, newPlaylistId);
  });

  // Request current state (for late joiners)
  socket.on("requestState", () => {
    const roomId = userRooms.get(socket.id);
    const roomState = roomStates.get(roomId);
    
    socket.emit("stateUpdate", {
      mediaType: roomState.mediaType,
      mediaId: roomState.mediaId,
      isPlaying: roomState.isPlaying,
      currentTime: roomState.currentTime,
      isNewUser: true
    });
  });

  socket.on("disconnect", () => {
    const roomId = userRooms.get(socket.id);
    console.log("User disconnected:", socket.id, "from room:", roomId);
    userRooms.delete(socket.id);
  });
});

// Clean up old rooms periodically (optional)
setInterval(() => {
  const now = Date.now();
  for (const [roomId, state] of roomStates.entries()) {
    // Remove rooms inactive for more than 1 hour
    if (now - state.lastUpdate > 3600000) {
      roomStates.delete(roomId);
      console.log(`Cleaned up room: ${roomId}`);
    }
  }
}, 60000); // Check every minute

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));