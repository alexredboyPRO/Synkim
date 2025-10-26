import React, { useEffect, useRef, useState } from "react";
import YouTube from "react-youtube";
import io from "socket.io-client";

// replace with your backend URL
const SOCKET_URL = "https://synkim.onrender.com";

function App() {
  const socketRef = useRef(null);
  const playerRef = useRef(null);
  const isRemoteAction = useRef(false);
  const lastSyncTime = useRef(0);
  const [videoId, setVideoId] = useState("dQw4w9WgXcQ"); // default video
  const [inputUrl, setInputUrl] = useState("");
  const [isPlaylist, setIsPlaylist] = useState(false);
  const [playerKey, setPlayerKey] = useState(0); // Key to force re-render

  // Extract video ID or playlist ID from a full YouTube URL
  function extractYouTubeId(url) {
    if (!url) return null;
    
    // Regular video patterns
    const videoPatterns = [
      /(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/, // Standard video URLs
      /embed\/([a-zA-Z0-9_-]{11})/ // Embed URLs
    ];

    // Playlist pattern
    const playlistPattern = /[&?]list=([a-zA-Z0-9_-]+)/;

    // Check for playlist first
    const playlistMatch = url.match(playlistPattern);
    if (playlistMatch) {
      return {
        type: "playlist",
        id: playlistMatch[1]
      };
    }

    // Check for video
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

  useEffect(() => {
    socketRef.current = io(SOCKET_URL);

    socketRef.current.on("play", (time) => {
      const player = playerRef.current;
      if (!player) return;
      
      // Only sync if difference is significant (3+ seconds)
      const currentTime = player.getCurrentTime();
      const diff = Math.abs(currentTime - time);
      
      if (diff > 3) {
        isRemoteAction.current = true;
        player.seekTo(time, true);
        console.log(`Syncing to ${time} (difference: ${diff.toFixed(2)}s)`);
      }
      
      player.playVideo();
      setTimeout(() => (isRemoteAction.current = false), 1000);
    });

    socketRef.current.on("pause", (time) => {
      const player = playerRef.current;
      if (!player) return;
      
      // Only sync if difference is significant (3+ seconds)
      const currentTime = player.getCurrentTime();
      const diff = Math.abs(currentTime - time);
      
      if (diff > 3) {
        isRemoteAction.current = true;
        player.seekTo(time, true);
        console.log(`Syncing to ${time} (difference: ${diff.toFixed(2)}s)`);
      }
      
      player.pauseVideo();
      setTimeout(() => (isRemoteAction.current = false), 1000);
    });

    socketRef.current.on("sync", (time) => {
      const player = playerRef.current;
      if (!player) return;
      
      // Prevent rapid successive syncs
      const now = Date.now();
      if (now - lastSyncTime.current < 5000) { // 5 second cooldown
        return;
      }
      
      const currentTime = player.getCurrentTime();
      const diff = Math.abs(currentTime - time);
      
      // Only sync if difference is substantial (5+ seconds)
      if (diff > 5) {
        isRemoteAction.current = true;
        player.seekTo(time, true);
        lastSyncTime.current = now;
        console.log(`Periodic sync to ${time} (difference: ${diff.toFixed(2)}s)`);
        setTimeout(() => (isRemoteAction.current = false), 1000);
      }
    });

    // handle video change
    socketRef.current.on("changeVideo", (newId) => {
      setVideoId(newId);
      setIsPlaylist(false);
      setPlayerKey(prev => prev + 1); // Force re-render
    });

    // handle playlist change
    socketRef.current.on("changePlaylist", (newPlaylistId) => {
      setVideoId(newPlaylistId);
      setIsPlaylist(true);
      setPlayerKey(prev => prev + 1); // Force re-render
    });

    return () => socketRef.current.disconnect();
  }, []);

  const onReady = (event) => {
    playerRef.current = event.target;

    // send current time less frequently (every 10 seconds)
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

  const onStateChange = (event) => {
    // Handle YouTube player state changes
    console.log("YouTube Player State:", event.data);
  };

  const onError = (event) => {
    console.error("YouTube Player Error:", event.data);
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
    } else {
      alert("Invalid YouTube link. Please provide a valid YouTube video or playlist URL.");
    }
  };

  // Different configuration for videos vs playlists
  const getPlayerOpts = () => {
    if (isPlaylist) {
      return {
        height: "390",
        width: "640",
        playerVars: {
          autoplay: 0,
          list: videoId,
          listType: 'playlist',
          origin: window.location.origin
        },
      };
    } else {
      return {
        height: "390",
        width: "640",
        playerVars: { 
          autoplay: 0,
          origin: window.location.origin
        },
      };
    }
  };

  return (
    <div style={{ textAlign: "center", padding: "30px" }}>
      <h1 style={{ fontSize: "36px", fontWeight: "bold", marginBottom: "20px" }}>
        SYNKIM
      </h1>

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
        key={playerKey} // Force re-render when video/playlist changes
        videoId={isPlaylist ? undefined : videoId}
        opts={getPlayerOpts()}
        onReady={onReady}
        onPlay={onPlay}
        onPause={onPause}
        onStateChange={onStateChange}
        onError={onError}
      />

      <p style={{ marginTop: "20px", color: "#555" }}>
        {isPlaylist ? "Now playing playlist" : "Now playing video"} - Open on two devices to test live sync.
      </p>
    </div>
  );
}

export default App;