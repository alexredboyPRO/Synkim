import React, { useEffect, useRef, useState, useCallback } from "react";
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

// Separate AuthForm component
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
  const hasReceivedInitialState = useRef(false);
  const [videoId, setVideoId] = useState("dQw4w9WgXcQ");
  const [inputUrl, setInputUrl] = useState("");
  const [isPlaylist, setIsPlaylist] = useState(false);
  const [playerKey, setPlayerKey] = useState(0);
  const [playlistId, setPlaylistId] = useState("");
  const [playerState, setPlayerState] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  
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
        hasReceivedInitialState.current = false;
      }
    });
    return unsubscribe;
  }, []);

  const safeSeekTo = useCallback((time) => {
    if (!playerRef.current) return false;
    try {
      playerRef.current.seekTo(time, true);
      return true;
    } catch (error) {
      console.error("Seek error:", error);
      return false;
    }
  }, []);

  const safePlayVideo = useCallback(() => {
    if (!playerRef.current) return false;
    try {
      playerRef.current.playVideo();
      return true;
    } catch (error) {
      console.error("Play error:", error);
      return false;
    }
  }, []);

  const safePauseVideo = useCallback(() => {
    if (!playerRef.current) return false;
    try {
      playerRef.current.pauseVideo();
      return true;
    } catch (error) {
      console.error("Pause error:", error);
      return false;
    }
  }, []);

  // Socket connection and event handlers
  useEffect(() => {
    if (!user) return;

    socketRef.current = io(SOCKET_URL);
    
    // Join room immediately after connection
    socketRef.current.emit("joinRoom", "default");

    // Receive current room state when joining - ONLY ONCE
    socketRef.current.on("roomState", (roomState) => {
      if (hasReceivedInitialState.current) {
        console.log("Ignoring duplicate room state");
        return;
      }
      
      console.log("Received initial room state:", roomState);
      hasReceivedInitialState.current = true;
      isRemoteAction.current = true;

      // Update media if different
      if (roomState.isPlaylist && roomState.playlistId && roomState.playlistId !== playlistId) {
        setPlaylistId(roomState.playlistId);
        setIsPlaylist(true);
        setPlayerKey(prev => prev + 1);
      } else if (roomState.videoId && roomState.videoId !== videoId) {
        setVideoId(roomState.videoId);
        setIsPlaylist(false);
        setPlayerKey(prev => prev + 1);
      }

      // Don't auto-sync time on initial load - let user control playback
      setTimeout(() => {
        isRemoteAction.current = false;
      }, 1000);
    });

    // SIMPLIFIED: Only handle play/pause events, no seeking
    socketRef.current.on("play", (data) => {
      if (isRemoteAction.current) return;
      
      console.log("Remote play received");
      isRemoteAction.current = true;

      // Update media if different
      if (data.isPlaylist !== isPlaylist || data.mediaId !== (isPlaylist ? playlistId : videoId)) {
        if (data.isPlaylist) {
          setPlaylistId(data.mediaId);
          setIsPlaylist(true);
        } else {
          setVideoId(data.mediaId);
          setIsPlaylist(false);
        }
        setPlayerKey(prev => prev + 1);
      }

      // Just play, don't seek
      setTimeout(() => {
        safePlayVideo();
        setTimeout(() => {
          isRemoteAction.current = false;
        }, 500);
      }, 100);
    });

    socketRef.current.on("pause", (data) => {
      if (isRemoteAction.current) return;
      
      console.log("Remote pause received");
      isRemoteAction.current = true;
      
      setTimeout(() => {
        safePauseVideo();
        setTimeout(() => {
          isRemoteAction.current = false;
        }, 500);
      }, 100);
    });

    // SIMPLIFIED: Remove sync event for now to prevent constant refreshing
    socketRef.current.on("sync", (data) => {
      // Disabled for now to prevent constant refreshing
      return;
    });

    socketRef.current.on("changeVideo", (data) => {
      console.log("Remote video change:", data);
      isRemoteAction.current = true;
      setVideoId(data.videoId);
      setIsPlaylist(false);
      setPlayerKey(prev => prev + 1);
      setTimeout(() => {
        isRemoteAction.current = false;
      }, 1000);
    });

    socketRef.current.on("changePlaylist", (data) => {
      console.log("Remote playlist change:", data);
      isRemoteAction.current = true;
      setPlaylistId(data.playlistId);
      setIsPlaylist(true);
      setPlayerKey(prev => prev + 1);
      setTimeout(() => {
        isRemoteAction.current = false;
      }, 1000);
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      hasReceivedInitialState.current = false;
    };
  }, [user, isPlaylist, playlistId, videoId, playerState, safeSeekTo, safePlayVideo, safePauseVideo]);

  const onReady = useCallback((event) => {
    playerRef.current = event.target;
    console.log("Player ready");
    setPlayerState(-1);

    // Disabled auto-sync for now to prevent constant refreshing
    // We'll rely on manual play/pause events only
  }, []);

  const onPlay = useCallback(() => {
    if (isRemoteAction.current) {
      console.log("Ignoring play - remote action in progress");
      return;
    }
    
    console.log("Local play initiated");
    setIsPlaying(true);
    
    if (playerRef.current && playerState >= 0) {
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
  }, [isPlaylist, playlistId, videoId, playerState]);

  const onPause = useCallback(() => {
    if (isRemoteAction.current) {
      console.log("Ignoring pause - remote action in progress");
      return;
    }
    
    console.log("Local pause initiated");
    setIsPlaying(false);
    
    if (playerRef.current && playerState >= 0) {
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
  }, [isPlaylist, playlistId, videoId, playerState]);

  const onStateChange = useCallback((event) => {
    const newState = event.data;
    setPlayerState(newState);
    
    // Update playing state based on YouTube player state
    if (newState === 1) {
      if (!isPlaying) setIsPlaying(true);
    } else if (newState === 2 || newState === 0) {
      if (isPlaying) setIsPlaying(false);
    }

    // Handle playlist auto-play
    if (isPlaylist && newState === 5 && !isRemoteAction.current) {
      setTimeout(() => {
        if (playerRef.current && !isRemoteAction.current) {
          safePlayVideo();
        }
      }, 1000);
    }

    // Reset remote action flag on ended state
    if (newState === 0) {
      isRemoteAction.current = false;
    }
  }, [isPlaylist, isPlaying, safePlayVideo]);

  const onError = useCallback((event) => {
    console.error("Player error:", event.data);
    isRemoteAction.current = false;
  }, []);

  const handleVideoChange = () => {
    const result = extractYouTubeId(inputUrl);
    if (result) {
      if (result.type === "playlist") {
        const data = { playlistId: result.id };
        setPlaylistId(result.id);
        setIsPlaylist(true);
        if (socketRef.current) {
          socketRef.current.emit("changePlaylist", data);
        }
      } else {
        const data = { videoId: result.id };
        setVideoId(result.id);
        setIsPlaylist(false);
        if (socketRef.current) {
          socketRef.current.emit("changeVideo", data);
        }
      }
      setInputUrl("");
      setPlayerKey(prev => prev + 1);
    } else {
      alert("Invalid YouTube link. Please provide a valid YouTube video or playlist URL.");
    }
  };

  const getPlayerOpts = useCallback(() => {
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
  }, [isPlaylist, playlistId]);

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
        Status: {isPlaying ? "Playing" : "Paused"} | 
        Player State: {playerState === -1 ? "Unstarted" : 
                     playerState === 0 ? "Ended" : 
                     playerState === 1 ? "Playing" : 
                     playerState === 2 ? "Paused" : 
                     playerState === 3 ? "Buffering" : 
                     playerState === 5 ? "Video Cued" : "Unknown"}
        {isRemoteAction.current && " | Syncing..."}
      </div>

      <p style={{ marginTop: "20px", color: "#555" }}>
        {isPlaylist ? `Playing playlist: ${playlistId}` : `Playing video: ${videoId}`}
      </p>
    </div>
  );
}

export default App;