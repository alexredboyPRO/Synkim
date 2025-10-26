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
  const [playerState, setPlayerState] = useState(-1); // -1: unstarted, 0: ended, 1: playing, 2: paused, 3: buffering, 5: video cued

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

  // Safe player control functions
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

  useEffect(() => {
    socketRef.current = io(SOCKET_URL);

    socketRef.current.on("play", (data) => {
      if (isRemoteAction.current) return;
      
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
      
      // Only sync if player is ready and not in error state
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
      if (now - lastSyncTime.current < 8000) { // Increased cooldown
        return;
      }
      
      const { time, isPlaylist: remoteIsPlaylist, mediaId } = data;
      
      if (remoteIsPlaylist !== isPlaylist || mediaId !== (isPlaylist ? playlistId : videoId)) {
        return;
      }
      
      if (playerRef.current && playerState >= 0) {
        const currentTime = playerRef.current.getCurrentTime();
        const diff = Math.abs(currentTime - time);
        
        if (diff > 8) { // Increased threshold
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

    return () => socketRef.current.disconnect();
  }, [isPlaylist, playlistId, videoId, playerState]);

  const onReady = (event) => {
    playerRef.current = event.target;
    console.log("Player ready");
    
    // Initialize player state
    setPlayerState(-1); // unstarted

    // Start sync interval
    const syncInterval = setInterval(() => {
      if (playerRef.current && !isRemoteAction.current && playerState >= 0) {
        try {
          const t = playerRef.current.getCurrentTime();
          const mediaData = {
            time: t,
            isPlaylist: isPlaylist,
            mediaId: isPlaylist ? playlistId : videoId
          };
          socketRef.current.emit("sync", mediaData);
        } catch (error) {
          console.error("Sync error:", error);
        }
      }
    }, 15000); // Reduced frequency

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
        socketRef.current.emit("play", mediaData);
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
        socketRef.current.emit("pause", mediaData);
      } catch (error) {
        console.error("Pause emit error:", error);
      }
    }
  };

  const onStateChange = (event) => {
    const newState = event.data;
    setPlayerState(newState);
    console.log("Player state changed to:", newState);

    // Handle playlist auto-play when cued
    if (isPlaylist && newState === 5) { // 5 = video cued
      setTimeout(() => {
        if (playerRef.current && !isRemoteAction.current) {
          safePlayVideo();
        }
      }, 1000);
    }

    // Reset remote action flag on ended state
    if (newState === 0) { // 0 = ended
      isRemoteAction.current = false;
    }
  };

  const onError = (event) => {
    console.error("Player error:", event.data);
    // Don't try to recover immediately - wait for user action
    isRemoteAction.current = false;
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