import React, { useEffect, useRef } from "react";
import YouTube from "react-youtube";
import io from "socket.io-client";

// replace this URL with your Render backend URL
const SOCKET_URL = "https://synkim.onrender.com";

function App() {
  const socketRef = useRef(null);
  const playerRef = useRef(null);
  const isRemoteAction = useRef(false);

  useEffect(() => {
    socketRef.current = io(SOCKET_URL);

    // --- Receive remote play event ---
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

    // --- Receive remote pause event ---
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

    // --- Receive remote time sync event (every few seconds) ---
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

    return () => socketRef.current.disconnect();
  }, []);

  // --- Handle ready event ---
  const onReady = (event) => {
    playerRef.current = event.target;

    // emit current time periodically to help resync
    setInterval(() => {
      if (playerRef.current && !isRemoteAction.current) {
        const t = playerRef.current.getCurrentTime();
        socketRef.current.emit("sync", t);
      }
    }, 3000);
  };

  // --- Local play and pause handlers ---
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

  // --- Render YouTube player ---
  const opts = {
    height: "390",
    width: "640",
    playerVars: {
      autoplay: 0,
    },
  };

  return (
    <div className="App" style={{ textAlign: "center", marginTop: "40px" }}>
      <h2>YouTube Sync Demo</h2>
      <YouTube
        videoId="dQw4w9WgXcQ" // change this video ID
        opts={opts}
        onReady={onReady}
        onPlay={onPlay}
        onPause={onPause}
      />
      <p>Open this page on two browsers or devices to test sync.</p>
    </div>
  );
}

export default App;
