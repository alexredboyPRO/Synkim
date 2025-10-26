import React, { useEffect, useRef, useState } from "react";
import YouTube from "react-youtube";
import io from "socket.io-client";

const SOCKET_URL = "https://synkim.onrender.com";

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

  function extractYouTubeId(url) {
    if (!url) return null;
    
    const videoPatterns = [
      /(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
      /embed\/([a-zA-Z0-9_-]{11})/
    ];

    const playlistPattern = /[&?]list=([a-zA-Z0-9_-]+)/;

    // Check for playlist
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

    socketRef.current.on("play", (data) => {
      const player = playerRef.current;
      if (!player) return;
      
      const { time, isPlaylist: remoteIsPlaylist, mediaId } = data;
      
      // Handle playlist sync
      if (remoteIsPlaylist && mediaId !== playlistId) {
        setPlaylistId(mediaId);
        setIsPlaylist(true);
        setPlayerKey(prev => prev + 1);
        return;
      }
      
      // Handle video sync
      if (!remoteIsPlaylist && mediaId !== videoId) {
        setVideoId(mediaId);
        setIsPlaylist(false);
        setPlayerKey(prev => prev + 1);
        return;
      }
      
      // Sync time
      const currentTime = player.getCurrentTime();
      const diff = Math.abs(currentTime - time);
      
      if (diff > 3) {
        isRemoteAction.current = true;
        player.seekTo(time, true);
      }
      
      player.playVideo();
      setTimeout(() => (isRemoteAction.current = false), 1000);
    });

    socketRef.current.on("pause", (data) => {
      const player = playerRef.current;
      if (!player) return;
      
      const { time, isPlaylist: remoteIsPlaylist, mediaId } = data;
      
      // Handle media type changes
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
      
      const currentTime = player.getCurrentTime();
      const diff = Math.abs(currentTime - time);
      
      if (diff > 3) {
        isRemoteAction.current = true;
        player.seekTo(time, true);
      }
      
      player.pauseVideo();
      setTimeout(() => (isRemoteAction.current = false), 1000);
    });

    socketRef.current.on("sync", (data) => {
      const player = playerRef.current;
      if (!player) return;
      
      const now = Date.now();
      if (now - lastSyncTime.current < 5000) {
        return;
      }
      
      const { time, isPlaylist: remoteIsPlaylist, mediaId } = data;
      
      // Don't sync if media type doesn't match
      if (remoteIsPlaylist !== isPlaylist || mediaId !== (isPlaylist ? playlistId : videoId)) {
        return;
      }
      
      const currentTime = player.getCurrentTime();
      const diff = Math.abs(currentTime - time);
      
      if (diff > 5) {
        isRemoteAction.current = true;
        player.seekTo(time, true);
        lastSyncTime.current = now;
        setTimeout(() => (isRemoteAction.current = false), 1000);
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

    return () => socketRef.current.disconnect();
  }, [isPlaylist, playlistId, videoId]);

  const onReady = (event) => {
    playerRef.current = event.target;
    console.log("Player ready:", isPlaylist ? `Playlist: ${playlistId}` : `Video: ${videoId}`);

    // For playlists, ensure they start properly
    if (isPlaylist && playerRef.current && playerRef.current.playVideo) {
      setTimeout(() => {
        if (playerRef.current) {
          playerRef.current.stopVideo(); // Stop first
          setTimeout(() => {
            if (playerRef.current) {
              playerRef.current.playVideo(); // Then play
            }
          }, 100);
        }
      }, 1000);
    }

    setInterval(() => {
      if (playerRef.current && !isRemoteAction.current) {
        const t = playerRef.current.getCurrentTime();
        const mediaData = {
          time: t,
          isPlaylist: isPlaylist,
          mediaId: isPlaylist ? playlistId : videoId
        };
        socketRef.current.emit("sync", mediaData);
      }
    }, 10000);
  };

  const onPlay = () => {
    if (!isRemoteAction.current && playerRef.current) {
      const t = playerRef.current.getCurrentTime();
      const mediaData = {
        time: t,
        isPlaylist: isPlaylist,
        mediaId: isPlaylist ? playlistId : videoId
      };
      socketRef.current.emit("play", mediaData);
    }
  };

  const onPause = () => {
    if (!isRemoteAction.current && playerRef.current) {
      const t = playerRef.current.getCurrentTime();
      const mediaData = {
        time: t,
        isPlaylist: isPlaylist,
        mediaId: isPlaylist ? playlistId : videoId
      };
      socketRef.current.emit("pause", mediaData);
    }
  };

  const onStateChange = (event) => {
    console.log("Player state:", event.data);
    // If player is cued but not playing for playlists, try to play
    if (isPlaylist && event.data === 5) { // 5 = video cued
      setTimeout(() => {
        if (playerRef.current && playerRef.current.playVideo) {
          playerRef.current.playVideo();
        }
      }, 500);
    }
  };

  const onError = (event) => {
    console.error("Player error:", event.data);
    // If there's an error with playlist, try reloading
    if (isPlaylist && playerRef.current) {
      setTimeout(() => {
        if (playerRef.current) {
          playerRef.current.stopVideo();
          setTimeout(() => {
            if (playerRef.current) {
              playerRef.current.playVideo();
            }
          }, 100);
        }
      }, 1000);
    }
  };

  const handleVideoChange = () => {
    const result = extractYouTubeId(inputUrl);
    if (result) {
      if (result.type === "playlist") {
        setPlaylistId(result.id);
        setIsPlaylist(true);
        socketRef.current.emit("changePlaylist", result.id);
      } else {
        setVideoId(result.id);
        setIsPlaylist(false);
        socketRef.current.emit("changeVideo", result.id);
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

      <p style={{ marginTop: "20px", color: "#555" }}>
        {isPlaylist ? `Playing playlist: ${playlistId}` : `Playing video: ${videoId}`}
      </p>
    </div>
  );
}

export default App;