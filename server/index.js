const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const axios = require('axios');
const querystring = require('querystring');

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// === SPOTIFY CONFIGURATION ===
const CLIENT_ID = 'a758e55feda243d88c6a31d5b5f937be';
const CLIENT_SECRET = '51079ca0e6f24e6fb4007f0f3bfbc4b6';
const REDIRECT_URI = 'http://localhost:3001/callback'; // Must match Spotify Dashboard

// Simple in-memory store: socketId -> { access_token, refresh_token }
const spotifyTokens = new Map();

// === SPOTIFY AUTH ENDPOINTS ===

// 1. Start Spotify Login
app.get('/spotify/login', (req, res) => {
  const scope = 'user-read-currently-playing';
  const authUrl = 'https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: CLIENT_ID,
      scope: scope,
      redirect_uri: REDIRECT_URI,
      state: req.query.socketId // Pass socket ID to link user
    });
  res.redirect(authUrl);
});

// 2. Spotify Callback - Exchange code for tokens
app.get('/callback', async (req, res) => {
  const code = req.query.code || null;
  const state = req.query.state; // This is our socketId
  const error = req.query.error;

  if (error) {
    console.error('Spotify auth error:', error);
    return res.send('Authentication failed');
  }

  if (!state || !code) {
    return res.send('Missing parameters');
  }

  try {
    // Exchange authorization code for access token
    const authResponse = await axios.post('https://accounts.spotify.com/api/token',
      querystring.stringify({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: REDIRECT_URI,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')
        }
      }
    );

    const { access_token, refresh_token, expires_in } = authResponse.data;
    
    // Store tokens with socket ID
    spotifyTokens.set(state, {
      access_token,
      refresh_token,
      expiry: Date.now() + (expires_in * 1000)
    });

    console.log(`Spotify tokens stored for socket: ${state}`);
    
    // Send success to frontend
    res.send(`
      <html>
        <body>
          <h2>Spotify Connected Successfully!</h2>
          <p>You can close this window and return to the app.</p>
          <script>
            window.close();
          </script>
        </body>
      </html>
    `);

  } catch (error) {
    console.error('Error exchanging token:', error.response?.data || error.message);
    res.send('Error during authentication');
  }
});

// === SPOTIFY API HELPER FUNCTIONS ===

// Refresh expired access token
async function refreshAccessToken(socketId) {
  const userData = spotifyTokens.get(socketId);
  if (!userData?.refresh_token) return null;

  try {
    const response = await axios.post('https://accounts.spotify.com/api/token',
      querystring.stringify({
        grant_type: 'refresh_token',
        refresh_token: userData.refresh_token,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')
        }
      }
    );

    const { access_token, expires_in } = response.data;
    
    spotifyTokens.set(socketId, {
      ...userData,
      access_token,
      expiry: Date.now() + (expires_in * 1000)
    });

    console.log(`Token refreshed for socket: ${socketId}`);
    return access_token;
  } catch (error) {
    console.error('Error refreshing token:', error.response?.data || error.message);
    return null;
  }
}

// Get currently playing track
async function getCurrentTrack(access_token) {
  try {
    const response = await axios.get('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: { 'Authorization': `Bearer ${access_token}` }
    });

    if (response.status === 200) {
      const data = response.data;
      return {
        isPlaying: data.is_playing,
        song: data.item.name,
        artist: data.item.artists.map(a => a.name).join(', '),
        album: data.item.album.name,
        albumArt: data.item.album.images[0]?.url,
        progressMs: data.progress_ms,
        durationMs: data.item.duration_ms,
        timestamp: Date.now()
      };
    } else if (response.status === 204) {
      return null; // No track currently playing
    }
  } catch (error) {
    if (error.response?.status === 401) {
      return 'token_expired';
    }
    console.error('Error fetching current track:', error.response?.data || error.message);
    return null;
  }
}

// === SOCKET.IO SETUP ===
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // === EXISTING YOUTUBE SYNC EVENTS ===
  socket.on("play", (time) => {
    socket.broadcast.emit("play", time);
  });

  socket.on("pause", (time) => {
    socket.broadcast.emit("pause", time);
  });

  socket.on("sync", (time) => {
    socket.broadcast.emit("sync", time);
  });

  socket.on("changeVideo", (newId) => {
    socket.broadcast.emit("changeVideo", newId);
  });

  socket.on("changePlaylist", (newPlaylistId) => {
    socket.broadcast.emit("changePlaylist", newPlaylistId);
  });

  // === NEW SPOTIFY EVENTS ===
  
  // Request to start Spotify login
  socket.on("spotifyLogin", () => {
    socket.emit("spotifyAuthUrl", `http://localhost:3001/spotify/login?socketId=${socket.id}`);
  });

  // Check Spotify playback status
  socket.on("getSpotifyStatus", async () => {
    const userData = spotifyTokens.get(socket.id);
    
    if (!userData) {
      socket.emit("spotifyStatus", { error: "not_connected" });
      return;
    }

    // Check if token needs refresh
    let access_token = userData.access_token;
    if (Date.now() > userData.expiry) {
      access_token = await refreshAccessToken(socket.id);
      if (!access_token) {
        socket.emit("spotifyStatus", { error: "token_expired" });
        return;
      }
    }

    const trackData = await getCurrentTrack(access_token);
    
    if (trackData === 'token_expired') {
      socket.emit("spotifyStatus", { error: "token_expired" });
    } else if (trackData) {
      // Broadcast to all other users
      socket.broadcast.emit("userListening", {
        userId: socket.id,
        ...trackData
      });
      // Send to the requesting user too
      socket.emit("spotifyStatus", trackData);
    } else {
      socket.emit("spotifyStatus", { isPlaying: false });
    }
  });

  // Clean up on disconnect
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    spotifyTokens.delete(socket.id);
  });
});

// === PERIODIC SPOTIFY STATUS CHECK ===
setInterval(async () => {
  for (const [socketId, userData] of spotifyTokens.entries()) {
    const socket = io.sockets.sockets.get(socketId);
    if (!socket) continue;

    // Check token expiry
    let access_token = userData.access_token;
    if (Date.now() > userData.expiry) {
      access_token = await refreshAccessToken(socketId);
      if (!access_token) continue;
    }

    const trackData = await getCurrentTrack(access_token);
    if (trackData && trackData !== 'token_expired' && trackData.isPlaying) {
      // Broadcast to all other connected users
      socket.broadcast.emit("userListening", {
        userId: socketId,
        ...trackData
      });
    }
  }
}, 10000); // Check every 10 seconds

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));