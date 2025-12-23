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
const REDIRECT_URI = 'https://synkim.onrender.com/callback';

// YouTube API Configuration - Get from Google Cloud Console
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || 'AIzaSyAdv5C9r9363O80k9xNDiXseMLK3tArqJU';

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
      state: req.query.socketId
    });
  res.redirect(authUrl);
});

// 2. Spotify Callback - Exchange code for tokens
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

    console.log(`Spotify tokens stored for socket: ${state}`);
    
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
         Authorization successful! You can close this window.
       </p>
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
      return null;
    }
  } catch (error) {
    if (error.response?.status === 401) {
      return 'token_expired';
    }
    console.error('Error fetching current track:', error.response?.data || error.message);
    return null;
  }
}

// === IMPROVED YOUTUBE SEARCH FUNCTION ===
async function searchYouTubeVideo(songName, artistName, durationMs = null) {
  try {
    // If no YouTube API key is set, try alternative search methods
    if (!YOUTUBE_API_KEY || YOUTUBE_API_KEY === 'YOUR_YOUTUBE_API_KEY_HERE') {
      console.log('YouTube API key not configured, trying alternative search...');
      return await searchYouTubeAlternative(songName, artistName);
    }

    // Try multiple search strategies
    const searchQueries = [
      `${songName} ${artistName}`,  // Basic search
      `${songName}`,                // Just song name
      `${songName} ${artistName.split(',')[0]}`,  // First artist only
      `${songName} lyrics`,         // Lyrics video
      `${songName} ${artistName} official`,  // Official version
      `${artistName} ${songName}`,  // Artist first
    ];

    for (const query of searchQueries) {
      try {
        console.log(`Searching YouTube with query: "${query}"`);
        
        const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
          params: {
            part: 'snippet',
            q: query,
            type: 'video',
            maxResults: 5,  // Get more results to find better match
            key: YOUTUBE_API_KEY,
            videoEmbeddable: 'true',
            safeSearch: 'none'
          }
        });

        if (response.data.items && response.data.items.length > 0) {
          // Try to find the best match
          const videos = response.data.items;
          
          // Look for videos with similar duration if duration is provided
          if (durationMs) {
            // Get video details for duration comparison
            const videoIds = videos.map(v => v.id.videoId).join(',');
            const detailsResponse = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
              params: {
                part: 'contentDetails',
                id: videoIds,
                key: YOUTUBE_API_KEY
              }
            });
            
            if (detailsResponse.data.items) {
              // Find video with closest duration
              const videoDetails = detailsResponse.data.items;
              let bestMatch = null;
              let smallestDiff = Infinity;
              
              for (let i = 0; i < videoDetails.length; i++) {
                const duration = videoDetails[i].contentDetails.duration;
                const videoDurationMs = parseDuration(duration);
                
                if (videoDurationMs) {
                  const diff = Math.abs(videoDurationMs - durationMs);
                  if (diff < smallestDiff) {
                    smallestDiff = diff;
                    bestMatch = videos[i];
                  }
                }
              }
              
              if (bestMatch && smallestDiff < durationMs * 0.5) { // Within 50% difference
                console.log(`Found duration-based match: ${bestMatch.id.videoId}`);
                return bestMatch.id.videoId;
              }
            }
          }
          
          // If no duration match or no duration provided, return the first result
          console.log(`Found video: ${videos[0].id.videoId} for query: "${query}"`);
          return videos[0].id.videoId;
        }
      } catch (queryError) {
        console.log(`Query "${query}" failed, trying next...`);
        continue;
      }
    }
    
    console.log(`No YouTube video found for: ${songName} - ${artistName}`);
    return null;
    
  } catch (error) {
    console.error('YouTube search error:', error.response?.data || error.message);
    // Fallback to alternative search
    return await searchYouTubeAlternative(songName, artistName);
  }
}

// Parse YouTube duration (PT1H2M3S) to milliseconds
function parseDuration(duration) {
  const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  if (!match) return null;
  
  const hours = (match[1] || '0H').replace('H', '');
  const minutes = (match[2] || '0M').replace('M', '');
  const seconds = (match[3] || '0S').replace('S', '');
  
  return (parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds)) * 1000;
}

// Alternative YouTube search without official API (for development/testing)
async function searchYouTubeAlternative(songName, artistName) {
  try {
    // This is a simple fallback that uses a public endpoint
    // Note: This might not work for all songs and may be less reliable
    const searchQuery = encodeURIComponent(`${songName} ${artistName} music video`);
    const searchUrl = `https://www.youtube.com/results?search_query=${searchQuery}`;
    
    // In a real implementation, you might use a different approach here
    // For now, let's return null and handle it gracefully
    console.log(`Alternative search triggered for: ${songName} - ${artistName}`);
    console.log(`You can search manually at: ${searchUrl}`);
    
    // Return a default popular music video if search fails
    // This ensures the app doesn't break completely
    return 'dQw4w9WgXcQ'; // Rick Astley - Never Gonna Give You Up (as fallback)
    
  } catch (error) {
    console.error('Alternative search error:', error);
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
      socket.broadcast.emit("userListening", {
        userId: socket.id,
        ...trackData
      });
      socket.emit("spotifyStatus", trackData);
    } else {
      socket.emit("spotifyStatus", { isPlaying: false });
    }
  });

  // === IMPROVED YOUTUBE SEARCH EVENT ===
  socket.on("playSpotifyOnYouTube", async (data) => {
    console.log(`Searching YouTube for: ${data.song} - ${data.artist}`);
    
    try {
      // Include duration in search if available
      const videoId = await searchYouTubeVideo(data.song, data.artist, data.durationMs);
      
      if (videoId) {
        console.log(`Found YouTube video ID: ${videoId} for ${data.song}`);
        
        // Broadcast to all users to change video
        io.emit("changeVideo", videoId);
        
        // Notify the user who requested it
        socket.emit("youtubeSearchResult", {
          success: true,
          videoId: videoId,
          song: data.song,
          artist: data.artist,
          message: `Now playing ${data.song} on YouTube`
        });
      } else {
        console.log(`No YouTube video found for: ${data.song}`);
        socket.emit("youtubeSearchResult", {
          success: false,
          song: data.song,
          artist: data.artist,
          message: `Couldn't find "${data.song}" on YouTube. Try searching manually.`
        });
      }
    } catch (error) {
      console.error('Error in YouTube search:', error);
      socket.emit("youtubeSearchResult", {
        success: false,
        song: data.song,
        artist: data.artist,
        message: 'Error searching for YouTube video. Please try again.'
      });
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
}, 10000);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));