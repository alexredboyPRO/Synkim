const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const axios = require('axios');

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
const REDIRECT_URI = 'https://synkim.onrender.com/callback';

// YouTube API Key - Set this in Render Environment Variables
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || 'AIzaSyAdv5C9r9363O80k9xNDiXseMLK3tArqJU';

// Simple in-memory store: socketId -> { access_token, refresh_token }
const spotifyTokens = new Map();

// NEW: Store user profiles (socketId -> { username, userId })
const userProfiles = new Map();

// === SPOTIFY AUTH ENDPOINTS ===
app.get('/spotify/login', (req, res) => {
  const scope = 'user-read-currently-playing';
  const authUrl = 'https://accounts.spotify.com/authorize?' +
    new URLSearchParams({
      response_type: 'code',
      client_id: CLIENT_ID,
      scope: scope,
      redirect_uri: REDIRECT_URI,
      state: req.query.socketId
    }).toString();
  res.redirect(authUrl);
});

app.get('/callback', async (req, res) => {
  const code = req.query.code || null;
  const state = req.query.state;
  const error = req.query.error;

  if (error) {
    console.error('Spotify auth error:', error);
    return res.send('Authentication failed');
  }

  if (!state || !code) {
    return res.send('Missing parameters');
  }

  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('redirect_uri', REDIRECT_URI);

    const authResponse = await axios.post('https://accounts.spotify.com/api/token', params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')
      }
    });

    const { access_token, refresh_token, expires_in } = authResponse.data;
    
    spotifyTokens.set(state, {
      access_token,
      refresh_token,
      expiry: Date.now() + (expires_in * 1000)
    });

    console.log(`✅ Spotify tokens stored for socket: ${state}`);
    
    res.send(`
    <html>
      <head>
        <title>Spotify Authorization</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #1DB954, #191414);
            color: white;
          }
          .container {
            text-align: center;
            padding: 40px;
            background: rgba(0, 0, 0, 0.8);
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
          }
          .success {
            font-size: 24px;
            margin-bottom: 20px;
          }
          .close-btn {
            background: #1DB954;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 16px;
            margin-top: 20px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success">✅ Authorization successful!</div>
          <p>You can now close this window and return to SYNKIM.</p>
          <button class="close-btn" onclick="window.close()">Close Window</button>
        </div>
        <script>
          if (window.opener) {
            window.opener.postMessage('spotify_auth_success', '*');
          }
        </script>
      </body>
    </html>
    `);

  } catch (error) {
    console.error('❌ Error exchanging token:', error.response?.data || error.message);
    res.send('<html><body><h2>Authentication failed. Please try again.</h2></body></html>');
  }
});

// === SPOTIFY API HELPER FUNCTIONS ===
async function refreshAccessToken(socketId) {
  const userData = spotifyTokens.get(socketId);
  if (!userData?.refresh_token) return null;

  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', userData.refresh_token);

    const response = await axios.post('https://accounts.spotify.com/api/token', params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')
      }
    });

    const { access_token, expires_in } = response.data;
    
    spotifyTokens.set(socketId, {
      ...userData,
      access_token,
      expiry: Date.now() + (expires_in * 1000)
    });

    console.log(`🔄 Token refreshed for socket: ${socketId}`);
    return access_token;
  } catch (error) {
    console.error('❌ Error refreshing token:', error.response?.data || error.message);
    return null;
  }
}

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
      return null;
    }
  } catch (error) {
    if (error.response?.status === 401) {
      return 'token_expired';
    }
    console.error('❌ Error fetching current track:', error.message);
    return null;
  }
}

// === YOUTUBE SEARCH FUNCTION ===
function cleanSongTitle(title) {
  if (!title) return '';
  return title
    .replace(/\(feat\..*\)/i, '')
    .replace(/\(with.*\)/i, '')
    .replace(/\(.*remix.*\)/i, '')
    .replace(/\[.*\]/g, '')
    .replace(/official video/i, '')
    .replace(/official audio/i, '')
    .replace(/lyrics/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanArtistName(artist) {
  if (!artist) return '';
  return artist.split(',')[0].split('&')[0].split('feat.')[0].trim();
}

async function searchYouTubeVideo(songName, artistName) {
  try {
    const cleanSong = cleanSongTitle(songName);
    const cleanArtist = cleanArtistName(artistName);
    
    console.log(`🔍 Searching YouTube: "${cleanSong}" by "${cleanArtist}"`);
    
    const query = `${cleanSong} ${cleanArtist}`;
    
    const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
      params: {
        part: 'snippet',
        q: query,
        type: 'video',
        maxResults: 1,
        key: YOUTUBE_API_KEY,
        videoEmbeddable: 'true'
      }
    });

    if (response.data.items && response.data.items.length > 0) {
      const video = response.data.items[0];
      console.log(`✅ Found: "${video.snippet.title}"`);
      return video.id.videoId;
    }
    
    // If first search fails, try without artist
    const response2 = await axios.get('https://www.googleapis.com/youtube/v3/search', {
      params: {
        part: 'snippet',
        q: cleanSong,
        type: 'video',
        maxResults: 1,
        key: YOUTUBE_API_KEY,
        videoEmbeddable: 'true'
      }
    });

    if (response2.data.items && response2.data.items.length > 0) {
      const video = response2.data.items[0];
      console.log(`✅ Found (song only): "${video.snippet.title}"`);
      return video.id.videoId;
    }
    
    console.log(`❌ No results for "${cleanSong}"`);
    return null;
    
  } catch (error) {
    console.error('❌ YouTube search error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
    return null;
  }
}

// === SOCKET.IO SETUP ===
io.on("connection", (socket) => {
  console.log(`👤 User connected: ${socket.id}`);

  // NEW: Handle username updates from frontend
  socket.on("updateUsername", (data) => {
    userProfiles.set(socket.id, {
      username: data.username,
      userId: data.userId
    });
    console.log(`👤 Username set for ${socket.id}: ${data.username}`);
  });

  // YouTube sync events
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
    console.log(`🎬 Changing video to: ${newId}`);
    socket.broadcast.emit("changeVideo", newId);
  });

  socket.on("changePlaylist", (newPlaylistId) => {
    socket.broadcast.emit("changePlaylist", newPlaylistId);
  });

  // Spotify events
  socket.on("spotifyLogin", () => {
    console.log(`🎵 Spotify login requested by: ${socket.id}`);
    socket.emit("spotifyAuthUrl", `https://synkim.onrender.com/spotify/login?socketId=${socket.id}`);
  });

  // Check Spotify playback status
  socket.on("getSpotifyStatus", async () => {
    const userData = spotifyTokens.get(socket.id);
    
    if (!userData) {
      socket.emit("spotifyStatus", { error: "not_connected" });
      return;
    }

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
      // Get username for this socket
      const userProfile = userProfiles.get(socket.id);
      const displayName = userProfile?.username || `User ${socket.id.substring(0, 8)}`;
      
      // Broadcast to all other users
      socket.broadcast.emit("userListening", {
        userId: socket.id,
        username: displayName,
        ...trackData
      });
      
      // Send to the requesting user too
      socket.emit("spotifyStatus", trackData);
    } else {
      socket.emit("spotifyStatus", { isPlaying: false });
    }
  });

  // YouTube search event
  socket.on("playSpotifyOnYouTube", async (data) => {
    console.log(`\n🎯 YouTube search requested for: ${data.song} - ${data.artist}`);
    
    try {
      const videoId = await searchYouTubeVideo(data.song, data.artist);
      
      if (videoId) {
        console.log(`✅ Found video ID: ${videoId}`);
        
        // Broadcast to all users
        io.emit("changeVideo", videoId);
        
        // Notify requester
        socket.emit("youtubeSearchResult", {
          success: true,
          videoId: videoId,
          song: data.song,
          artist: data.artist,
          message: `Now playing "${data.song}" on YouTube`
        });
      } else {
        console.log(`❌ No video found`);
        socket.emit("youtubeSearchResult", {
          success: false,
          song: data.song,
          artist: data.artist,
          message: `Couldn't find "${data.song}" on YouTube. Try searching manually.`
        });
      }
    } catch (error) {
      console.error('🚨 Search error:', error.message);
      socket.emit("youtubeSearchResult", {
        success: false,
        song: data.song,
        artist: data.artist,
        message: 'Error searching YouTube. Please try again.'
      });
    }
  });

  // Clean up on disconnect
  socket.on("disconnect", () => {
    console.log(`👤 User disconnected: ${socket.id}`);
    spotifyTokens.delete(socket.id);
    userProfiles.delete(socket.id);
  });
});

// === PERIODIC SPOTIFY STATUS CHECK ===
setInterval(async () => {
  for (const [socketId, userData] of spotifyTokens.entries()) {
    const socket = io.sockets.sockets.get(socketId);
    if (!socket) continue;

    let access_token = userData.access_token;
    if (Date.now() > userData.expiry) {
      access_token = await refreshAccessToken(socketId);
      if (!access_token) continue;
    }

    const trackData = await getCurrentTrack(access_token);
    if (trackData && trackData !== 'token_expired' && trackData.isPlaying) {
      // Get username for this socket
      const userProfile = userProfiles.get(socketId);
      const displayName = userProfile?.username || `User ${socketId.substring(0, 8)}`;
      
      socket.broadcast.emit("userListening", {
        userId: socketId,
        username: displayName,
        ...trackData
      });
    }
  }
}, 15000);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'SYNKIM Backend',
    youtubeApi: YOUTUBE_API_KEY ? 'configured' : 'missing',
    spotifyClients: spotifyTokens.size,
    userProfiles: userProfiles.size,
    timestamp: new Date().toISOString()
  });
});

// Test endpoint for YouTube search
app.get('/test-search', async (req, res) => {
  const { song = 'Let Me Love You', artist = 'DJ Snake' } = req.query;
  
  try {
    const videoId = await searchYouTubeVideo(song, artist);
    
    if (videoId) {
      res.json({
        success: true,
        song: song,
        artist: artist,
        videoId: videoId,
        youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
        message: 'Search successful!'
      });
    } else {
      res.json({
        success: false,
        song: song,
        artist: artist,
        message: 'No video found',
        youtubeApiKey: YOUTUBE_API_KEY ? 'configured' : 'missing'
      });
    }
  } catch (error) {
    res.json({
      success: false,
      error: error.message,
      song: song,
      artist: artist
    });
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`\n🚀 SYNKIM Backend Server started on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
  console.log(`🔧 Test search: http://localhost:${PORT}/test-search?song=Let+Me+Love+You&artist=DJ+Snake`);
  console.log(`🎯 YouTube API Key: ${YOUTUBE_API_KEY ? 'Configured' : '⚠️  MISSING - Get one from Google Cloud Console!'}`);
  
  if (!YOUTUBE_API_KEY || YOUTUBE_API_KEY.includes('AIzaSyAdv5C9r9363O80k9xNDiXseMLK3tArqJU')) {
    console.log('\n⚠️  IMPORTANT: You need a valid YouTube API Key!');
    console.log('1. Go to: https://console.cloud.google.com/');
    console.log('2. Create project → Enable "YouTube Data API v3"');
    console.log('3. Create API key → Add to Render Environment as YOUTUBE_API_KEY');
  }
});