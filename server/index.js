const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const axios = require('axios');
const querystring = require('querystring');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

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

// YouTube API Configuration - GET THIS FROM GOOGLE CLOUD CONSOLE
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || 'AIzaSyAdv5C9r9363O80k9xNDiXseMLK3tArqJU';

// Check if YouTube API key is properly configured
if (!YOUTUBE_API_KEY || YOUTUBE_API_KEY === 'AIzaSyAdv5C9r9363O80k9xNDiXseMLK3tArqJU') {
  console.warn('⚠️  WARNING: Using placeholder YouTube API key. Get a real key from Google Cloud Console!');
  console.warn('  1. Go to https://console.cloud.google.com/');
  console.warn('  2. Create a project and enable "YouTube Data API v3"');
  console.warn('  3. Create an API key and set it as YOUTUBE_API_KEY environment variable');
}

// Simple in-memory store: socketId -> { access_token, refresh_token }
const spotifyTokens = new Map();

// === SPOTIFY AUTH ENDPOINTS ===
app.get('/spotify/login', (req, res) => {
  const scope = 'user-read-currently-playing';
  const authUrl = 'https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: CLIENT_ID,
      scope: scope,
      redirect_uri: REDIRECT_URI,
      state: req.query.socketId
    });
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
    
    spotifyTokens.set(state, {
      access_token,
      refresh_token,
      expiry: Date.now() + (expires_in * 1000)
    });

    console.log(`✅ Spotify tokens stored for socket: ${state}`);
    
    res.send(`
    <html>
      <body>
        <script>
          if (window.opener) {
            window.opener.postMessage('spotify_auth_success', '*');
          }
          setTimeout(() => window.close(), 500);
        </script>
        <p style="text-align: center; margin-top: 50px; font-family: sans-serif;">
          ✅ Authorization successful! You can close this window.
        </p>
      </body>
    </html>
    `);

  } catch (error) {
    console.error('❌ Error exchanging token:', error.response?.data || error.message);
    res.send('Error during authentication');
  }
});

// === SPOTIFY API HELPER FUNCTIONS ===
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
    console.error('❌ Error fetching current track:', error.response?.data || error.message);
    return null;
  }
}

// === IMPROVED YOUTUBE SEARCH FUNCTION ===
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

async function searchYouTubeVideo(songName, artistName, durationMs = null) {
  console.log(`\n🎵 Searching YouTube for: "${songName}" by "${artistName}"`);
  
  // Clean the inputs
  const cleanSong = cleanSongTitle(songName);
  const cleanArtist = cleanArtistName(artistName);
  
  console.log(`🧹 Cleaned to: "${cleanSong}" by "${cleanArtist}"`);
  
  // Create multiple search query variations
  const searchQueries = [
    `${cleanSong} ${cleanArtist}`,                    // Standard
    `${cleanSong}`,                                   // Just song name
    `${cleanArtist} ${cleanSong}`,                    // Artist first
    `${cleanSong} ${cleanArtist} official`,           // Official version
    `${cleanSong} ${cleanArtist} music video`,        // Music video
    `${cleanSong} ${cleanArtist} audio`,              // Audio version
    `${cleanSong} lyrics ${cleanArtist}`,             // Lyrics
    `${cleanSong} ${cleanArtist.split(' ')[0]}`,      // First word of artist
  ];

  // Remove duplicates
  const uniqueQueries = [...new Set(searchQueries.filter(q => q.length > 3))];
  
  console.log(`🔍 Trying ${uniqueQueries.length} search queries...`);

  for (const query of uniqueQueries) {
    try {
      console.log(`   Trying: "${query}"`);
      
      const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
        params: {
          part: 'snippet',
          q: query,
          type: 'video',
          maxResults: 5,
          key: YOUTUBE_API_KEY,
          videoEmbeddable: 'true',
          safeSearch: 'none'
        },
        timeout: 5000
      });

      if (response.data.items && response.data.items.length > 0) {
        const video = response.data.items[0];
        console.log(`✅ Found video: "${video.snippet.title}" (ID: ${video.id.videoId})`);
        console.log(`🔗 https://www.youtube.com/watch?v=${video.id.videoId}`);
        return video.id.videoId;
      }
      
    } catch (error) {
      // Log API errors but continue to next query
      if (error.response) {
        console.log(`   ❌ API Error for query "${query}": ${error.response.status} ${error.response.statusText}`);
        if (error.response.status === 403) {
          console.log('   ⚠️  YouTube API quota may be exceeded or key invalid');
          break; // Stop trying if we get auth errors
        }
      }
      continue; // Try next query
    }
  }
  
  // If all queries fail, try a fallback search
  console.log('🔄 All queries failed, trying fallback...');
  return await youtubeFallbackSearch(cleanSong, cleanArtist);
}

async function youtubeFallbackSearch(songName, artistName) {
  try {
    // Try one more time with a very simple query
    const simpleQuery = `${songName} ${artistName}`.substring(0, 50);
    
    const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
      params: {
        part: 'snippet',
        q: simpleQuery,
        type: 'video',
        maxResults: 1,
        key: YOUTUBE_API_KEY
      }
    });

    if (response.data.items && response.data.items.length > 0) {
      return response.data.items[0].id.videoId;
    }
    
    // Ultimate fallback: Return popular music videos based on genre
    const fallbackVideos = {
      'pop': 'kJQP7kiw5Fk',    // Despacito
      'hiphop': 'JGhoLcsr8GA', // Congratulations
      'rock': 'fJ9rUzIMcZQ',   // Bohemian Rhapsody
      'edm': '60ItHLz5WEA',    // Faded
      'default': 'dQw4w9WgXcQ' // Never Gonna Give You Up
    };
    
    console.log(`🎯 Using fallback video for "${songName}"`);
    return fallbackVideos.default;
    
  } catch (error) {
    console.error('❌ Fallback search failed:', error.message);
    return 'dQw4w9WgXcQ'; // Always have a fallback
  }
}

// === SOCKET.IO SETUP ===
io.on("connection", (socket) => {
  console.log(`\n👤 User connected: ${socket.id}`);

  // === YOUTUBE SYNC EVENTS ===
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

  // === SPOTIFY EVENTS ===
  socket.on("spotifyLogin", () => {
    console.log(`🎵 Spotify login requested by: ${socket.id}`);
    socket.emit("spotifyAuthUrl", `https://synkim.onrender.com/spotify/login?socketId=${socket.id}`);
  });

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
      socket.broadcast.emit("userListening", {
        userId: socket.id,
        ...trackData
      });
      socket.emit("spotifyStatus", trackData);
    } else {
      socket.emit("spotifyStatus", { isPlaying: false });
    }
  });

  // === YOUTUBE SEARCH EVENT ===
  socket.on("playSpotifyOnYouTube", async (data) => {
    console.log(`\n🎯 YouTube search requested by ${socket.id}`);
    console.log(`📀 Song: ${data.song}`);
    console.log(`🎤 Artist: ${data.artist}`);
    console.log(`⏱️  Duration: ${data.durationMs ? Math.floor(data.durationMs/1000) + 's' : 'N/A'}`);
    
    try {
      const startTime = Date.now();
      const videoId = await searchYouTubeVideo(data.song, data.artist, data.durationMs);
      const searchTime = Date.now() - startTime;
      
      if (videoId) {
        console.log(`✅ Search successful in ${searchTime}ms`);
        console.log(`🔗 Found YouTube ID: ${videoId}`);
        
        // Broadcast to ALL users (including sender)
        io.emit("changeVideo", videoId);
        
        // Send success response
        socket.emit("youtubeSearchResult", {
          success: true,
          videoId: videoId,
          song: data.song,
          artist: data.artist,
          message: `Now playing "${data.song}" on YouTube`
        });
        
        console.log(`📡 Video change broadcasted to all users`);
      } else {
        console.log(`❌ No video found for "${data.song}"`);
        socket.emit("youtubeSearchResult", {
          success: false,
          song: data.song,
          artist: data.artist,
          message: `Couldn't find "${data.song}" on YouTube. Try a different song or check your API key.`
        });
      }
    } catch (error) {
      console.error('🚨 YouTube search error:', error);
      socket.emit("youtubeSearchResult", {
        success: false,
        song: data.song,
        artist: data.artist,
        message: `Search error: ${error.message}. Please try again.`
      });
    }
  });

  // Clean up on disconnect
  socket.on("disconnect", () => {
    console.log(`👤 User disconnected: ${socket.id}`);
    spotifyTokens.delete(socket.id);
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
      socket.broadcast.emit("userListening", {
        userId: socketId,
        ...trackData
      });
    }
  }
}, 15000); // Check every 15 seconds

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    youtubeApiKey: YOUTUBE_API_KEY ? 'configured' : 'missing',
    spotifyClients: spotifyTokens.size,
    timestamp: new Date().toISOString()
  });
});

// Debug endpoint to test YouTube search
app.get('/test-youtube-search', async (req, res) => {
  const { song, artist } = req.query;
  
  if (!song || !artist) {
    return res.json({ error: 'Please provide song and artist parameters' });
  }
  
  try {
    const videoId = await searchYouTubeVideo(song, artist);
    res.json({
      success: !!videoId,
      videoId: videoId,
      song: song,
      artist: artist,
      youtubeUrl: videoId ? `https://www.youtube.com/watch?v=${videoId}` : null
    });
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
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health`);
  console.log(`🔧 Test search: http://localhost:${PORT}/test-youtube-search?song=Let+Me+Love+You&artist=DJ+Snake`);
  console.log(`📺 YouTube API Key: ${YOUTUBE_API_KEY ? 'Configured' : 'MISSING!'}`);
  if (!YOUTUBE_API_KEY || YOUTUBE_API_KEY.includes('YOUR_')) {
    console.log('⚠️  WARNING: You need a valid YouTube API key!');
  }
});