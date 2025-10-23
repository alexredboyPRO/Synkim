import React, { useEffect, useRef, useState } from "react";
import YouTube from "react-youtube";
import io from "socket.io-client";

// replace with your backend URL
const SOCKET_URL = "https://synkim.onrender.com";

function App() {
  const socketRef = useRef(null);
  const playerRef = useRef(null);
  const isRemoteAction = useRef(false);
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
      const diff = Math.abs(player.getCurrentTime() - time);
      if (diff > 0.5) {
        isRemoteAction.current = true;
        player.seekTo(time, true);
      }
      player.playVideo();
      setTimeout(() => (isRemoteAction.current = false), 500);
    });

    socketRef.current.on("pause", (time) => {
      const player = playerRef.current;
      if (!player) return;
      const diff = Math.abs(player.getCurrentTime() - time);
      if (diff > 0.5) {
        isRemoteAction.current = true;
        player.seekTo(time, true);
      }
      player.pauseVideo();
      setTimeout(() => (isRemoteAction.current = false), 500);
    });

    socketRef.current.on("sync", (time) => {
      const player = playerRef.current;
      if (!player) return;
      const diff = Math.abs(player.getCurrentTime() - time);
      if (diff > 1) {
        isRemoteAction.current = true;
        player.seekTo(time, true);
        setTimeout(() => (isRemoteAction.current = false), 500);
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

    // send current time every 3 seconds
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
