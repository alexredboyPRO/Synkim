import React, { useEffect, useRef, useState } from "react";
import YouTube from "react-youtube";
import io from "socket.io-client";
import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "firebase/auth";

const SOCKET_URL = "https://synkim.onrender.com";

// Replace with your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyD-IbYzApHkLTnDX8vXDf_fid2ULzyyu_s",
  authDomain: "synkim-dfd33.firebaseapp.com",
  projectId: "synkim-dfd33",
  storageBucket: "synkim-dfd33.firebasestorage.app",
  messagingSenderId: "982327873530",
  appId: "1:982327873530:web:b3a2bebf995b48f65c5e43"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

function App() {
  const socketRef = useRef(null);
  const playerRef = useRef(null);
  const isRemoteAction = useRef(false);
  const [videoId, setVideoId] = useState("dQw4w9WgXcQ");
  const [inputUrl, setInputUrl] = useState("");
  const [isPlaylist, setIsPlaylist] = useState(false);
  
  // Auth states
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [authError, setAuthError] = useState("");

  // Spotify states
  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [spotifyTrack, setSpotifyTrack] = useState(null);
  const [userListening, setUserListening] = useState({});

  // YouTube search states
  const [youtubeSearchStatus, setYoutubeSearchStatus] = useState(null);

  // === ADD THIS NEW useEffect FOR POPUP MESSAGES ===
  // Listen for messages from the Spotify auth popup
  useEffect(() => {
    const handleMessage = (event) => {
      console.log("Message received from popup:", event.data);
      // Check for our success message
      if (event.data === 'spotify_auth_success') {
        console.log('Spotify authentication successful!');
        // Update UI state to show connected
        setSpotifyConnected(true);
        // Immediately request the current status from backend
        if (socketRef.current) {
          console.log('Requesting Spotify status...');
          socketRef.current.emit('getSpotifyStatus');
        }
      }
    };

    // Add the event listener
    window.addEventListener('message', handleMessage);
    console.log("Message listener added for Spotify auth");

    // Clean up the listener when component unmounts
    return () => {
      window.removeEventListener('message', handleMessage);
      console.log("Message listener removed");
    };
  }, []); // Empty dependency array means this runs once on mount

  // Extract video ID or playlist ID
  function extractYouTubeId(url) {
    if (!url) return null;
    
    const videoPatterns = [
      /(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
      /embed\/([a-zA-Z0-9_-]{11})/
    ];

    const playlistPattern = /[&?]list=([a-zA-Z0-9_-]+)/;

    const playlistMatch = url.match(playlistPattern);
    if (playlistMatch) {
      return {
        type: "playlist",
        id: playlistMatch[1]
      };
    }

    for (const pattern of videoPatterns) {
      const match = url.match(pattern);
      if (match) {
        return {
          type: "video",
          id: match[1]
        };
      }
    }

    return null;
  }

  // Auth functions
  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError("");
    
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (error) {
      setAuthError(error.message);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  // Spotify connect function - WITH DEBUG LOGGING
  const handleSpotifyConnect = () => {
    console.log("Spotify connect button clicked");
    console.log("Socket exists?", !!socketRef.current);
    console.log("Socket connected?", socketRef.current?.connected);
    console.log("Spotify connected state:", spotifyConnected);
    
    if (!spotifyConnected && socketRef.current) {
      console.log("Emitting spotifyLogin event...");
      socketRef.current.emit("spotifyLogin");
    } else if (spotifyConnected) {
      console.log("Already connected, getting status...");
      socketRef.current.emit("getSpotifyStatus");
    } else {
      console.log("No socket connection available");
    }
  };

  // Function to handle playing Spotify song on YouTube
  const handlePlayOnYouTube = (song, artist) => {
    if (!socketRef.current) {
      alert("Not connected to server");
      return;
    }
    
    setYoutubeSearchStatus({ loading: true, song, artist });
    
    socketRef.current.emit("playSpotifyOnYouTube", {
      song: song,
      artist: artist,
      userId: user?.uid || 'anonymous'
    });
  };

  // Listen to auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      if (user) {
        setAuthError("");
      }
    });
    return unsubscribe;
  }, []);

  // Socket setup - ALWAYS ACTIVE SYNC
  useEffect(() => {
    if (!user) return;

    console.log("Connecting to socket server...");
    socketRef.current = io(SOCKET_URL, {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    // Add connection event listeners
    socketRef.current.on("connect", () => {
      console.log("Socket connected with ID:", socketRef.current.id);
    });

    socketRef.current.on("connect_error", (error) => {
      console.error("Socket connection error:", error);
    });

    socketRef.current.on("disconnect", (reason) => {
      console.log("Socket disconnected:", reason);
    });

    // YouTube sync events
    socketRef.current.on("play", (time) => {
      const player = playerRef.current;
      if (!player) return;
      
      isRemoteAction.current = true;
      
      // ALWAYS check time difference and sync if needed
      const currentTime = player.getCurrentTime();
      if (Math.abs(currentTime - time) > 0.5) {
        player.seekTo(time, true);
      }
      
      player.playVideo();
      setTimeout(() => (isRemoteAction.current = false), 300);
    });

    socketRef.current.on("pause", (time) => {
      const player = playerRef.current;
      if (!player) return;
      
      isRemoteAction.current = true;
      
      // ALWAYS check time difference and sync if needed
      const currentTime = player.getCurrentTime();
      if (Math.abs(currentTime - time) > 0.5) {
        player.seekTo(time, true);
      }
      
      player.pauseVideo();
      setTimeout(() => (isRemoteAction.current = false), 300);
    });

    socketRef.current.on("sync", (time) => {
      const player = playerRef.current;
      if (!player) return;
      
      // ALWAYS sync if out of sync (small threshold)
      const currentTime = player.getCurrentTime();
      if (Math.abs(currentTime - time) > 1) {
        isRemoteAction.current = true;
        player.seekTo(time, true);
        setTimeout(() => (isRemoteAction.current = false), 300);
      }
    });

    socketRef.current.on("changeVideo", (newId) => {
      setVideoId(newId);
      setIsPlaylist(false);
    });

    socketRef.current.on("changePlaylist", (newPlaylistId) => {
      setVideoId(newPlaylistId);
      setIsPlaylist(true);
    });

    // Spotify event handlers
    socketRef.current.on("spotifyAuthUrl", (url) => {
      console.log("Received Spotify auth URL:", url);
      // Open Spotify login in a popup directly
      const popup = window.open(url, "Spotify Login", "width=600,height=700");
      // Check if popup was blocked
      if (!popup || popup.closed) {
        alert("Popup blocked! Please allow popups for this site.");
        console.error("Popup was blocked by browser");
      } else {
        console.log("Spotify login popup opened successfully");
      }
    });

    socketRef.current.on("spotifyStatus", (data) => {
      console.log("Received Spotify status:", data);
      if (data.error === "not_connected") {
        setSpotifyConnected(false);
        setSpotifyTrack(null);
      } else if (data.error === "token_expired") {
        setSpotifyConnected(false);
        alert("Spotify token expired. Please reconnect.");
      } else if (data.isPlaying) {
        setSpotifyConnected(true);
        setSpotifyTrack(data);
      } else {
        setSpotifyConnected(true);
        setSpotifyTrack(null);
      }
    });

    socketRef.current.on("userListening", (data) => {
      console.log("User listening data received:", data);
      setUserListening(prev => ({
        ...prev,
        [data.userId]: data
      }));
    });

    // YouTube search result handler
    socketRef.current.on("youtubeSearchResult", (result) => {
      console.log("YouTube search result:", result);
      
      if (result.success) {
        setYoutubeSearchStatus({
          loading: false,
          success: true,
          message: `Now playing ${result.song} on YouTube`,
          song: result.song,
          artist: result.artist
        });
        
        // Clear the status message after 3 seconds
        setTimeout(() => {
          setYoutubeSearchStatus(null);
        }, 3000);
      } else {
        setYoutubeSearchStatus({
          loading: false,
          success: false,
          message: result.message || "Failed to find YouTube video",
          song: result.song,
          artist: result.artist
        });
        
        // Clear the status message after 5 seconds
        setTimeout(() => {
          setYoutubeSearchStatus(null);
        }, 5000);
      }
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        console.log("Socket disconnected");
      }
    };
  }, [user]);

  // Periodically check Spotify status
  useEffect(() => {
    if (!socketRef.current || !spotifyConnected) return;
    
    const interval = setInterval(() => {
      console.log("Auto-checking Spotify status...");
      socketRef.current.emit("getSpotifyStatus");
    }, 15000); // Check every 15 seconds
    
    return () => clearInterval(interval);
  }, [spotifyConnected]);

  const onReady = (event) => {
    playerRef.current = event.target;
    console.log("YouTube player ready");

    // Continuous sync every 3 seconds
    const syncInterval = setInterval(() => {
      if (playerRef.current && !isRemoteAction.current) {
        const t = playerRef.current.getCurrentTime();
        socketRef.current.emit("sync", t);
      }
    }, 3000);
    
    // Store interval for cleanup
    return () => clearInterval(syncInterval);
  };

  const onPlay = () => {
    if (!isRemoteAction.current && playerRef.current) {
      const t = playerRef.current.getCurrentTime();
      socketRef.current.emit("play", t);
    }
  };

  const onPause = () => {
    if (!isRemoteAction.current && playerRef.current) {
      const t = playerRef.current.getCurrentTime();
      socketRef.current.emit("pause", t);
    }
  };

  const handleVideoChange = () => {
    const result = extractYouTubeId(inputUrl);
    if (result) {
      if (result.type === "playlist") {
        setVideoId(result.id);
        setIsPlaylist(true);
        socketRef.current.emit("changePlaylist", result.id);
      } else {
        setVideoId(result.id);
        setIsPlaylist(false);
        socketRef.current.emit("changeVideo", result.id);
      }
      setInputUrl("");
    } else {
      alert("Invalid YouTube link.");
    }
  };

  // Responsive YouTube player options
  const getPlayerOpts = () => {
    // Get screen width for responsive sizing
    const screenWidth = window.innerWidth;
    let width, height;
    
    if (screenWidth < 768) { // Mobile
      width = Math.min(screenWidth - 40, 400); // 40px for padding
      height = width * 0.75; // 4:3 aspect ratio for mobile
    } else if (screenWidth < 1024) { // Tablet
      width = 640;
      height = 390;
    } else { // Desktop
      width = 640;
      height = 390;
    }

    return {
      height: height.toString(),
      width: width.toString(),
      playerVars: { 
        autoplay: 0,
        ...(isPlaylist && { list: videoId, listType: 'playlist' })
      },
    };
  };

  // Auth Form
  if (!user) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: '#f5f5f5',
        padding: '20px'
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '30px 20px',
          borderRadius: '10px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          width: '100%',
          maxWidth: '400px'
        }}>
          <h2 style={{ 
            textAlign: 'center', 
            marginBottom: '25px', 
            color: '#333',
            fontSize: '24px'
          }}>
            {isLogin ? 'Sign In to SYNKIM' : 'Create Account'}
          </h2>
          
          {authError && (
            <div style={{
              color: 'red',
              backgroundColor: '#ffe6e6',
              padding: '10px',
              borderRadius: '5px',
              marginBottom: '20px',
              textAlign: 'center',
              fontSize: '14px'
            }}>
              {authError}
            </div>
          )}

          <form onSubmit={handleAuth}>
            <div style={{ marginBottom: '15px' }}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                required
                style={{
                  width: '100%',
                  padding: '12px',
                  fontSize: '16px', // Prevents zoom on iOS
                  borderRadius: '5px',
                  border: '1px solid #ddd'
                }}
              />
            </div>
            
            <div style={{ marginBottom: '20px' }}>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
                style={{
                  width: '100%',
                  padding: '12px',
                  fontSize: '16px', // Prevents zoom on iOS
                  borderRadius: '5px',
                  border: '1px solid #ddd'
                }}
              />
            </div>

            <button
              type="submit"
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '16px',
                borderRadius: '5px',
                backgroundColor: '#007BFF',
                color: 'white',
                border: 'none',
                cursor: 'pointer',
                marginBottom: '15px'
              }}
            >
              {isLogin ? 'Sign In' : 'Sign Up'}
            </button>
          </form>

          <div style={{ textAlign: 'center' }}>
            <button
              onClick={() => {
                setIsLogin(!isLogin);
                setAuthError('');
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#007BFF',
                cursor: 'pointer',
                textDecoration: 'underline',
                fontSize: '14px'
              }}
            >
              {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main App
  return (
    <div style={{ 
      textAlign: "center", 
      padding: "20px 15px",
      minHeight: '100vh',
      boxSizing: 'border-box'
    }}>
      {/* CSS Animations */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes fadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
      `}</style>

      {/* Header */}
      <div style={{ 
        display: 'flex', 
        flexDirection: window.innerWidth < 768 ? 'column' : 'row',
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '20px',
        gap: '15px'
      }}>
        <h1 style={{ 
          fontSize: window.innerWidth < 768 ? "28px" : "36px", 
          fontWeight: "bold", 
          margin: 0 
        }}>
          SYNKIM
        </h1>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '15px',
          flexDirection: window.innerWidth < 768 ? 'column' : 'row'
        }}>
          <span style={{ 
            color: '#666',
            fontSize: window.innerWidth < 768 ? '14px' : '16px'
          }}>
            Welcome, {user.email}
          </span>
          <button
            onClick={handleSpotifyConnect}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              borderRadius: '5px',
              backgroundColor: spotifyConnected ? '#1DB954' : '#555',
              color: 'white',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            {spotifyConnected ? '🎵 Spotify Connected' : 'Connect Spotify'}
          </button>
          <button
            onClick={handleLogout}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              borderRadius: '5px',
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            Logout
          </button>
        </div>
      </div>

      {/* Video Input */}
      <div style={{ 
        marginBottom: "20px",
        display: 'flex',
        flexDirection: window.innerWidth < 768 ? 'column' : 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px'
      }}>
        <input
          type="text"
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          placeholder="Paste YouTube video or playlist link here"
          style={{
            width: window.innerWidth < 768 ? "100%" : "400px",
            maxWidth: "400px",
            padding: "10px",
            fontSize: "16px",
            borderRadius: "8px",
            border: "1px solid #ccc",
          }}
        />
        <button
          onClick={handleVideoChange}
          style={{
            padding: "10px 20px",
            fontSize: "16px",
            borderRadius: "8px",
            backgroundColor: "#007BFF",
            color: "white",
            border: "none",
            cursor: "pointer",
            whiteSpace: 'nowrap'
          }}
        >
          Load {isPlaylist ? "Playlist" : "Video"}
        </button>
      </div>

      {/* YouTube Player */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        marginBottom: '20px'
      }}>
        <YouTube
          videoId={isPlaylist ? undefined : videoId}
          opts={getPlayerOpts()}
          onReady={onReady}
          onPlay={onPlay}
          onPause={onPause}
        />
      </div>

      {/* Spotify Listening Display */}
      <div style={{ 
        marginTop: "20px",
        padding: "15px",
        backgroundColor: "#f8f9fa",
        borderRadius: "8px",
        maxWidth: "600px",
        margin: "20px auto",
        textAlign: "left"
      }}>
        <h3 style={{ marginBottom: "10px", color: "#333" }}>
          🎧 What's Playing
        </h3>
        
        {/* Current user's Spotify status */}
        {spotifyConnected && spotifyTrack && (
          <div style={{
            padding: "10px",
            marginBottom: "15px",
            backgroundColor: "#e8f5e9",
            borderRadius: "5px",
            borderLeft: "4px solid #1DB954"
          }}>
            <strong>You are listening to:</strong>
            <div style={{ marginTop: "5px" }}>
              <div style={{ fontWeight: "bold" }}>{spotifyTrack.song}</div>
              <div style={{ color: "#666" }}>{spotifyTrack.artist}</div>
              <div style={{ fontSize: "12px", color: "#888" }}>
                Album: {spotifyTrack.album} • 
                Progress: {Math.floor(spotifyTrack.progressMs / 1000)}s / 
                {Math.floor(spotifyTrack.durationMs / 1000)}s
              </div>
              {/* YouTube Play Button */}
              <button
                onClick={() => handlePlayOnYouTube(spotifyTrack.song, spotifyTrack.artist)}
                disabled={youtubeSearchStatus?.loading}
                style={{
                  marginTop: "10px",
                  padding: "8px 16px",
                  backgroundColor: "#FF0000",
                  color: "white",
                  border: "none",
                  borderRadius: "5px",
                  cursor: youtubeSearchStatus?.loading && youtubeSearchStatus?.song === spotifyTrack.song ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  opacity: youtubeSearchStatus?.loading && youtubeSearchStatus?.song === spotifyTrack.song ? 0.7 : 1
                }}
              >
                {youtubeSearchStatus?.loading && youtubeSearchStatus?.song === spotifyTrack.song ? (
                  <>
                    <span>Searching...</span>
                    <span className="spinner" style={{
                      width: "16px",
                      height: "16px",
                      border: "2px solid #fff",
                      borderTop: "2px solid transparent",
                      borderRadius: "50%",
                      animation: "spin 1s linear infinite"
                    }}></span>
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/>
                    </svg>
                    Play on YouTube
                  </>
                )}
              </button>
            </div>
          </div>
        )}
        
        {/* Other users' listening status */}
        {Object.keys(userListening).length > 0 && (
          <div>
            <h4 style={{ marginBottom: "10px", color: "#666" }}>
              Other Users Listening:
            </h4>
            {Object.entries(userListening).map(([userId, data]) => (
              <div key={userId} style={{
                padding: "8px",
                marginBottom: "8px",
                backgroundColor: "#fff",
                borderRadius: "5px",
                border: "1px solid #e0e0e0"
              }}>
                <div style={{ fontWeight: "bold" }}>User {userId.substring(0, 8)}...</div>
                <div>{data.song} - {data.artist}</div>
                {data.albumArt && (
                  <img 
                    src={data.albumArt} 
                    alt="Album Art" 
                    style={{ width: "50px", height: "50px", marginTop: "5px", borderRadius: "3px" }}
                  />
                )}
                {/* YouTube Play Button for Other Users */}
                <button
                  onClick={() => handlePlayOnYouTube(data.song, data.artist)}
                  disabled={youtubeSearchStatus?.loading && youtubeSearchStatus?.song === data.song}
                  style={{
                    marginTop: "8px",
                    padding: "6px 12px",
                    backgroundColor: "#FF0000",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: youtubeSearchStatus?.loading && youtubeSearchStatus?.song === data.song ? "not-allowed" : "pointer",
                    fontSize: "12px",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    opacity: youtubeSearchStatus?.loading && youtubeSearchStatus?.song === data.song ? 0.7 : 1
                  }}
                >
                  {youtubeSearchStatus?.loading && youtubeSearchStatus?.song === data.song ? (
                    <>
                      <span className="spinner" style={{
                        width: "12px",
                        height: "12px",
                        border: "2px solid #fff",
                        borderTop: "2px solid transparent",
                        borderRadius: "50%",
                        animation: "spin 1s linear infinite"
                      }}></span>
                      Searching...
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/>
                      </svg>
                      Play on YouTube
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
        
        {!spotifyConnected && Object.keys(userListening).length === 0 && (
          <div style={{ color: "#999", fontStyle: "italic" }}>
            No one is sharing their Spotify listening status yet.
            Connect Spotify to share what you're listening to!
          </div>
        )}
        
        {/* Debug info - remove in production */}
        <div style={{ marginTop: "10px", fontSize: "11px", color: "#aaa" }}>
          Socket: {socketRef.current?.connected ? "Connected" : "Disconnected"} | 
          Spotify: {spotifyConnected ? "Connected" : "Not Connected"}
        </div>
      </div>

      {/* YouTube Search Status Message */}
      {youtubeSearchStatus && (
        <div style={{
          position: "fixed",
          top: "20px",
          right: "20px",
          padding: "15px",
          backgroundColor: youtubeSearchStatus.success ? "#4CAF50" : youtubeSearchStatus.loading ? "#2196F3" : "#f44336",
          color: "white",
          borderRadius: "8px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          zIndex: 1000,
          maxWidth: "300px",
          animation: "slideIn 0.3s ease"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {youtubeSearchStatus.loading ? (
              <span className="spinner" style={{
                width: "20px",
                height: "20px",
                border: "3px solid #fff",
                borderTop: "3px solid transparent",
                borderRadius: "50%",
                animation: "spin 1s linear infinite"
              }}></span>
            ) : youtubeSearchStatus.success ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
              </svg>
            )}
            <span>{youtubeSearchStatus.message || (youtubeSearchStatus.loading ? "Searching YouTube..." : "")}</span>
          </div>
        </div>
      )}

      <p style={{ 
        marginTop: "20px", 
        color: "#555",
        fontSize: window.innerWidth < 768 ? "14px" : "16px"
      }}>
        {isPlaylist ? "Now playing playlist" : "Now playing video"} - Open on two devices to test sync.
      </p>
    </div>
  );
}

export default App;