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

    socketRef.current = io(SOCKET_URL);

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

    return () => socketRef.current.disconnect();
  }, [user]);

  const onReady = (event) => {
    playerRef.current = event.target;

    // Continuous sync every 3 seconds
    setInterval(() => {
      if (playerRef.current && !isRemoteAction.current) {
        const t = playerRef.current.getCurrentTime();
        socketRef.current.emit("sync", t);
      }
    }, 3000);
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