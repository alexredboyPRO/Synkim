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

// Separate AuthForm component to prevent re-renders
const AuthForm = ({ onAuth, onToggleMode, isLogin, authError, setAuthError }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    onAuth(email, password);
  };

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

        <form onSubmit={handleSubmit}>
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
              onToggleMode();
              setEmail("");
              setPassword("");
              setAuthError("");
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
};

function App() {
  const socketRef = useRef(null);
  const playerRef = useRef(null);
  const isRemoteAction = useRef(false);
  const lastSyncTime = useRef(0);
  const [videoId, setVideoId] = useState("dQw4w9WgXcQ");
  const [inputUrl, setInputUrl] = useState("");
  const [isPlaylist, setIsPlaylist] = useState(false);
  const [playerKey, setPlayerKey] = useState(0);
  const [playlistId, setPlaylistId] = useState("");
  const [playerState, setPlayerState] = useState(-1);
  
  // Auth states
  const [user, setUser] = useState(null);
  const [isLogin, setIsLogin] = useState(true);
  const [authError, setAuthError] = useState("");

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
  const handleAuth = async (email, password) => {
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

  const handleToggleAuthMode = () => {
    setIsLogin(!isLogin);
    setAuthError("");
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

  const safeSeekTo = (time) => {
    if (!playerRef.current) return false;
    try {
      playerRef.current.seekTo(time, true);
      return true;
    } catch (error) {
      console.error("Seek error:", error);
      return false;
    }
  };

  const safePlayVideo = () => {
    if (!playerRef.current) return false;
    try {
      playerRef.current.playVideo();
      return true;
    } catch (error) {
      console.error("Play error:", error);
      return false;
    }
  };

  const safePauseVideo = () => {
    if (!playerRef.current) return false;
    try {
      playerRef.current.pauseVideo();
      return true;
    } catch (error) {
      console.error("Pause error:", error);
      return false;
    }
  };

  // Socket connection and event handlers
  useEffect(() => {
    if (!user) return;

    socketRef.current = io(SOCKET_URL);

    socketRef.current.on("play", (data) => {
      if (isRemoteAction.current) return;
      
      const { time, isPlaylist: remoteIsPlaylist, mediaId } = data;
      
      if (remoteIsPlaylist !== isPlaylist || mediaId !== (isPlaylist ? playlistId : videoId)) {
        if (remoteIsPlaylist) {
          setPlaylistId(mediaId);
          setIsPlaylist(true);
        } else {
          setVideoId(mediaId);
          setIsPlaylist(false);
        }
        setPlayerKey(prev => prev + 1);
        return;
      }
      
      if (playerRef.current && playerState >= 0) {
        const currentTime = playerRef.current.getCurrentTime();
        const diff = Math.abs(currentTime - time);
        
        if (diff > 3) {
          isRemoteAction.current = true;
          safeSeekTo(time);
        }
        
        setTimeout(() => {
          safePlayVideo();
          setTimeout(() => {
            isRemoteAction.current = false;
          }, 500);
        }, 100);
      }
    });

    socketRef.current.on("pause", (data) => {
      if (isRemoteAction.current) return;
      
      const { time, isPlaylist: remoteIsPlaylist, mediaId } = data;
      
      if (remoteIsPlaylist !== isPlaylist || mediaId !== (isPlaylist ? playlistId : videoId)) {
        if (remoteIsPlaylist) {
          setPlaylistId(mediaId);
          setIsPlaylist(true);
        } else {
          setVideoId(mediaId);
          setIsPlaylist(false);
        }
        setPlayerKey(prev => prev + 1);
        return;
      }
      
      if (playerRef.current && playerState >= 0) {
        const currentTime = playerRef.current.getCurrentTime();
        const diff = Math.abs(currentTime - time);
        
        if (diff > 3) {
          isRemoteAction.current = true;
          safeSeekTo(time);
        }
        
        setTimeout(() => {
          safePauseVideo();
          setTimeout(() => {
            isRemoteAction.current = false;
          }, 500);
        }, 100);
      }
    });

    socketRef.current.on("sync", (data) => {
      if (isRemoteAction.current) return;
      
      const now = Date.now();
      if (now - lastSyncTime.current < 8000) {
        return;
      }
      
      const { time, isPlaylist: remoteIsPlaylist, mediaId } = data;
      
      if (remoteIsPlaylist !== isPlaylist || mediaId !== (isPlaylist ? playlistId : videoId)) {
        return;
      }
      
      if (playerRef.current && playerState >= 0) {
        const currentTime = playerRef.current.getCurrentTime();
        const diff = Math.abs(currentTime - time);
        
        if (diff > 8) {
          isRemoteAction.current = true;
          safeSeekTo(time);
          lastSyncTime.current = now;
          setTimeout(() => {
            isRemoteAction.current = false;
          }, 500);
        }
      }
    });

    socketRef.current.on("changeVideo", (newId) => {
      setVideoId(newId);
      setIsPlaylist(false);
      setPlayerKey(prev => prev + 1);
    });

    socketRef.current.on("changePlaylist", (newPlaylistId) => {
      setPlaylistId(newPlaylistId);
      setIsPlaylist(true);
      setPlayerKey(prev => prev + 1);
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [user, isPlaylist, playlistId, videoId, playerState]);

  const onReady = (event) => {
    playerRef.current = event.target;
    console.log("Player ready");
    setPlayerState(-1);

    const syncInterval = setInterval(() => {
      if (playerRef.current && !isRemoteAction.current && playerState >= 0) {
        try {
          const t = playerRef.current.getCurrentTime();
          const mediaData = {
            time: t,
            isPlaylist: isPlaylist,
            mediaId: isPlaylist ? playlistId : videoId
          };
          if (socketRef.current) {
            socketRef.current.emit("sync", mediaData);
          }
        } catch (error) {
          console.error("Sync error:", error);
        }
      }
    }, 15000);

    return () => clearInterval(syncInterval);
  };

  const onPlay = () => {
    if (!isRemoteAction.current && playerRef.current && playerState >= 0) {
      try {
        const t = playerRef.current.getCurrentTime();
        const mediaData = {
          time: t,
          isPlaylist: isPlaylist,
          mediaId: isPlaylist ? playlistId : videoId
        };
        if (socketRef.current) {
          socketRef.current.emit("play", mediaData);
        }
      } catch (error) {
        console.error("Play emit error:", error);
      }
    }
  };

  const onPause = () => {
    if (!isRemoteAction.current && playerRef.current && playerState >= 0) {
      try {
        const t = playerRef.current.getCurrentTime();
        const mediaData = {
          time: t,
          isPlaylist: isPlaylist,
          mediaId: isPlaylist ? playlistId : videoId
        };
        if (socketRef.current) {
          socketRef.current.emit("pause", mediaData);
        }
      } catch (error) {
        console.error("Pause emit error:", error);
      }
    }
  };

  const onStateChange = (event) => {
    const newState = event.data;
    setPlayerState(newState);

    if (isPlaylist && newState === 5) {
      setTimeout(() => {
        if (playerRef.current && !isRemoteAction.current) {
          safePlayVideo();
        }
      }, 1000);
    }

    if (newState === 0) {
      isRemoteAction.current = false;
    }
  };

  const onError = (event) => {
    console.error("Player error:", event.data);
    isRemoteAction.current = false;
  };

  const handleVideoChange = () => {
    const result = extractYouTubeId(inputUrl);
    if (result) {
      if (result.type === "playlist") {
        setPlaylistId(result.id);
        setIsPlaylist(true);
        if (socketRef.current) {
          socketRef.current.emit("changePlaylist", result.id);
        }
      } else {
        setVideoId(result.id);
        setIsPlaylist(false);
        if (socketRef.current) {
          socketRef.current.emit("changeVideo", result.id);
        }
      }
      setPlayerKey(prev => prev + 1);
    } else {
      alert("Invalid YouTube link. Please provide a valid YouTube video or playlist URL.");
    }
  };

  const getPlayerOpts = () => {
    const baseOpts = {
      height: "390",
      width: "640",
      playerVars: {
        autoplay: 0,
        modestbranding: 1,
        origin: window.location.origin,
        enablejsapi: 1,
        widget_referrer: window.location.origin
      },
    };

    if (isPlaylist) {
      return {
        ...baseOpts,
        playerVars: {
          ...baseOpts.playerVars,
          list: playlistId,
          listType: 'playlist',
          rel: 0
        }
      };
    } else {
      return baseOpts;
    }
  };

  // Render based on auth state
  if (!user) {
    return (
      <AuthForm 
        onAuth={handleAuth}
        onToggleMode={handleToggleAuthMode}
        isLogin={isLogin}
        authError={authError}
        setAuthError={setAuthError}
      />
    );
  }

  return (
    <div style={{ textAlign: "center", padding: "30px" }}>
      {/* Header with user info */}
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

      {isPlaylist ? (
        <YouTube
          key={playerKey}
          opts={getPlayerOpts()}
          onReady={onReady}
          onPlay={onPlay}
          onPause={onPause}
          onStateChange={onStateChange}
          onError={onError}
        />
      ) : (
        <YouTube
          key={playerKey}
          videoId={videoId}
          opts={getPlayerOpts()}
          onReady={onReady}
          onPlay={onPlay}
          onPause={onPause}
          onStateChange={onStateChange}
          onError={onError}
        />
      )}

      <div style={{ marginTop: "10px", color: "#666", fontSize: "14px" }}>
        Player State: {playerState === -1 ? "Unstarted" : 
                     playerState === 0 ? "Ended" :
                     playerState === 1 ? "Playing" :
                     playerState === 2 ? "Paused" :
                     playerState === 3 ? "Buffering" :
                     playerState === 5 ? "Video Cued" : "Unknown"}
      </div>

      <p style={{ marginTop: "20px", color: "#555" }}>
        {isPlaylist ? `Playing playlist: ${playlistId}` : `Playing video: ${videoId}`}
      </p>
    </div>
  );
}

export default App;