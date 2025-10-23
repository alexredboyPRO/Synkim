import React, { useEffect, useRef } from "react";
import { io } from "socket.io-client";

const SOCKET_URL = "https://synkim.onrender.com/"; // use your tunnel link
const ROOM = "room1";
const SYNC_THRESHOLD = 6;

export default function App() {
  const socketRef = useRef(null);
  const playerRef = useRef(null);
  const ready = useRef(false);
  const syncing = useRef(false);
  const lastSent = useRef(0);

  useEffect(() => {
    socketRef.current = io(SOCKET_URL, { transports: ["websocket"] });

    socketRef.current.on("connect", () => {
      console.log("socket connected", socketRef.current.id);
      socketRef.current.emit("join_room", ROOM);
    });

    socketRef.current.on("sync_action", data => {
      console.log("received sync_action", data);
      if (!ready.current) return;
      syncing.current = true;
      const { action, time } = data;
      if (typeof time === "number") {
        try { playerRef.current.seekTo(time, true); } catch (e) {}
      }
      if (action === "play") try { playerRef.current.playVideo(); } catch (e) {}
      if (action === "pause") try { playerRef.current.pauseVideo(); } catch (e) {}
      setTimeout(() => (syncing.current = false), 300);
    });

    return () => socketRef.current.disconnect();
  }, []);

  useEffect(() => {
    if (window.YT && window.YT.Player) { initPlayer(); return; }
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.body.appendChild(tag);
    window.onYouTubeIframeAPIReady = initPlayer;
    // eslint-disable-next-line
  }, []);

  function initPlayer() {
    playerRef.current = new window.YT.Player("player", {
      height: "360", width: "640",
      videoId: "dQw4w9WgXcQ",
      playerVars: { origin: window.location.origin },
      events: {
        onReady: () => {
          ready.current = true;
          console.log("YT ready");
        },
        onStateChange: event => {
          if (!ready.current) return;
          const state = event.data;
          if (syncing.current) return;
          const t = playerRef.current.getCurrentTime();
          if (state === 1) { // playing
            lastSent.current = t;
            socketRef.current.emit("sync_action", { room: ROOM, action: "play", time: t });
            console.log("emit play", t);
          }
          if (state === 2) { // paused
            lastSent.current = t;
            socketRef.current.emit("sync_action", { room: ROOM, action: "pause", time: t });
            console.log("emit pause", t);
          }
        }
      }
    });
  }

  useEffect(() => {
    const id = setInterval(() => {
      if (!ready.current || syncing.current) return;
      const state = playerRef.current?.getPlayerState();
      if (state !== 1) return;
      const cur = playerRef.current.getCurrentTime();
      if (Math.abs(cur - lastSent.current) > SYNC_THRESHOLD) {
        lastSent.current = cur;
        socketRef.current.emit("sync_action", { room: ROOM, action: "seek", time: cur });
        console.log("emit seek", cur);
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ padding: 12 }}>
      <h3>YouTube Sync — demo</h3>
      <div id="player" />
      <p>Open two tabs. Play/pause/seek in one. Watch the other.</p>
    </div>
  );
}
