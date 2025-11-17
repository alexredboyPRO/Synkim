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

  // Socket setup - SIMPLE AND CLEAN
  useEffect(() => {
    if (!user) return;

    socketRef.current = io(SOCKET_URL);

    socketRef.current.on("play", (time) => {
      const player = playerRef.current;
      if (!player) return;
      
      isRemoteAction.current = true;
      player.playVideo();
      
      // Small sync if difference is noticeable
      const currentTime = player.getCurrentTime();
      if (Math.abs(currentTime - time) > 2) {
        player.seekTo(time, true);
      }
      
      setTimeout(() => (isRemoteAction.current = false), 500);
    });

    socketRef.current.on("pause", (time) => {
      const player = playerRef.current;
      if (!player) return;
      
      isRemoteAction.current = true;
      player.pauseVideo();
      
      // Small sync if difference is noticeable
      const currentTime = player.getCurrentTime();
      if (Math.abs(currentTime - time) > 2) {
        player.seekTo(time, true);
      }
      
      setTimeout(() => (isRemoteAction.current = false), 500);
    });

    socketRef.current.on("sync", (time) => {
      const player = playerRef.current;
      if (!player) return;
      
      // Only sync if significantly out of sync
      const currentTime = player.getCurrentTime();
      if (Math.abs(currentTime - time) > 5) {
        isRemoteAction.current = true;
        player.seekTo(time, true);
        setTimeout(() => (isRemoteAction.current = false), 500);
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

    // Simple sync every 10 seconds
    setInterval(() => {
      if (playerRef.current && !isRemoteAction.current) {
        const t = playerRef.current.getCurrentTime();
        socketRef.current.emit("sync", t);
      }
    }, 10000);
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

  const opts = {
    height: "390",
    width: "640",
    playerVars: { 
      autoplay: 0,
      ...(isPlaylist && { list: videoId, listType: 'playlist' })
    },
  };

  // Auth Form
  if (!user) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: '#f5f5f5'
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '40px',
          borderRadius: '10px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          width: '400px'
        }}>
          <h2 style={{ textAlign: 'center', marginBottom: '30px', color: '#333' }}>
            {isLogin ? 'Sign In to SYNKIM' : 'Create Account'}
          </h2>
          
          {authError && (
            <div style={{
              color: 'red',
              backgroundColor: '#ffe6e6',
              padding: '10px',
              borderRadius: '5px',
              marginBottom: '20px',
              textAlign: 'center'
            }}>
              {authError}
            </div>
          )}

          <form onSubmit={handleAuth}>
            <div style={{ marginBottom: '20px' }}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                required
                style={{
                  width: '100%',
                  padding: '12px',
                  fontSize: '16px',
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
                  fontSize: '16px',
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
                textDecoration: 'underline'
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
    <div style={{ textAlign: "center", padding: "30px" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: "36px", fontWeight: "bold", margin: 0 }}>
          SYNKIM
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <span style={{ color: '#666' }}>Welcome, {user.email}</span>
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

      <div style={{ marginBottom: "20px" }}>
        <input
          type="text"
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          placeholder="Paste YouTube video or playlist link here"
          style={{
            width: "400px",
            padding: "8px",
            fontSize: "16px",
            borderRadius: "8px",
            border: "1px solid #ccc",
            marginRight: "10px",
          }}
        />
        <button
          onClick={handleVideoChange}
          style={{
            padding: "8px 16px",
            fontSize: "16px",
            borderRadius: "8px",
            backgroundColor: "#007BFF",
            color: "white",
            border: "none",
            cursor: "pointer",
          }}
        >
          Load {isPlaylist ? "Playlist" : "Video"}
        </button>
      </div>

      <YouTube
        videoId={isPlaylist ? undefined : videoId}
        opts={opts}
        onReady={onReady}
        onPlay={onPlay}
        onPause={onPause}
      />

      <p style={{ marginTop: "20px", color: "#555" }}>
        {isPlaylist ? "Now playing playlist" : "Now playing video"} - Open on two devices to test sync.
      </p>
    </div>
  );
}

export default App;