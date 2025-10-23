import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import YouTube from "react-youtube";

const SOCKET_URL = "https://synkim.onrender.com";

export default function App() {
  const [player, setPlayer] = useState(null);
  const socketRef = useRef();
  const lastSync = useRef(0); // throttle syncs
  const videoId = "dQw4w9WgXcQ"; // example

  useEffect(() => {
    socketRef.current = io(SOCKET_URL);

    socketRef.current.on("play", (time) => {
      if (!player) return;
      const diff = Math.abs(player.getCurrentTime() - time);
      if (diff > 0.5) player.seekTo(time, true);
      player.playVideo();
    });

    socketRef.current.on("pause", (time) => {
      if (!player) return;
      player.pauseVideo();
      const diff = Math.abs(player.getCurrentTime() - time);
      if (diff > 0.5) player.seekTo(time, true);
    });

    socketRef.current.on("sync", (time, state) => {
      if (!player) return;
      const diff = Math.abs(player.getCurrentTime() - time);
      if (diff > 0.5) player.seekTo(time, true);
      if (state === "play") player.playVideo();
      else player.pauseVideo();
    });

    return () => socketRef.current.disconnect();
  }, [player]);

  const onReady = (e) => setPlayer(e.target);

  // send events to others, but only occasionally
  const handleStateChange = (e) => {
    if (!socketRef.current || !player) return;
    const state = e.data;
    const current = player.getCurrentTime();
    const now = Date.now();

    // only emit every 2s max, or on play/pause
    if (state === 1) { // playing
      if (now - lastSync.current > 2000) {
        socketRef.current.emit("sync", { time: current, state: "play" });
        lastSync.current = now;
      }
    } else if (state === 2) { // paused
      socketRef.current.emit("sync", { time: current, state: "pause" });
    }
  };

  return (
    <div style={{ textAlign: "center", padding: 20 }}>
      <h2>YouTube Sync Player</h2>
      <YouTube
        videoId={videoId}
        onReady={onReady}
        onStateChange={handleStateChange}
      />
    </div>
  );
}
