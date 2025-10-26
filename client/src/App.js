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

  // Extract video ID from a full YouTube URL
  function extractVideoId(url) {
    const match = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : null;
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
    }, 10000); // Increased from 3 to 10 seconds
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
    const newId = extractVideoId(inputUrl);
    if (newId) {
      setVideoId(newId);
      socketRef.current.emit("changeVideo", newId);
    } else {
      alert("Invalid YouTube link.");
    }
  };

  const opts = {
    height: "390",
    width: "640",
    playerVars: { autoplay: 0 },
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
          placeholder="Paste YouTube link here"
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
          Load Video
        </button>
      </div>

      <YouTube
        videoId={videoId}
        opts={opts}
        onReady={onReady}
        onPlay={onPlay}
        onPause={onPause}
      />

      <p style={{ marginTop: "20px", color: "#555" }}>
        Open on two devices to test live sync.
      </p>
    </div>
  );
}

export default App;