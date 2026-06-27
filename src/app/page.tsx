"use client";

import { useState, useEffect, useRef } from "react";

// Types for Telegram WebApp SDK
interface TelegramUser {
  id?: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

interface TelegramWebApp {
  initData?: string;
  initDataUnsafe?: {
    query_id?: string;
    user?: TelegramUser;
  };
  expand?: () => void;
  ready?: () => void;
  HapticFeedback?: {
    impactOccurred: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
    notificationOccurred: (type: "error" | "success" | "warning") => void;
  };
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

interface LeaderboardEntry {
  user: string;
  score: number;
}

export default function Home() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(20.0);
  const [greenIndex, setGreenIndex] = useState<number | null>(null);
  const [redIndex, setRedIndex] = useState<number | null>(null);
  const [userName, setUserName] = useState("Cyberrunner");
  const [showGameOver, setShowGameOver] = useState(false);
  const [isNewHighScore, setIsNewHighScore] = useState(false);
  const [gridAnimation, setGridAnimation] = useState<string | null>(null);
  
  // New Leaderboard and Tab States
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [activeTab, setActiveTab] = useState<"game" | "leaderboard">("game");
  const [initData, setInitData] = useState<string>("");

  const greenIndexRef = useRef<number | null>(null);

  // Synced ref for green index to access in independent timers
  useEffect(() => {
    greenIndexRef.current = greenIndex;
  }, [greenIndex]);

  // Load Telegram SDK, High Score, and Fetch Leaderboard
  useEffect(() => {
    if (typeof window !== "undefined") {
      // Telegram WebApp Setup
      const webapp = window.Telegram?.WebApp;
      let initDataStr = webapp?.initData || "";

      if (webapp) {
        try {
          webapp.ready?.();
          webapp.expand?.();
          if (webapp.setHeaderColor) {
            webapp.setHeaderColor("#05050d");
          }
          if (webapp.setBackgroundColor) {
            webapp.setBackgroundColor("#05050d");
          }
          if (webapp.initDataUnsafe?.user?.first_name) {
            setUserName(webapp.initDataUnsafe.user.first_name);
          }
        } catch (e) {
          console.error("Failed to initialize Telegram WebApp SDK", e);
        }
      }

      // Mock auth bypass for local browser testing in development mode
      if (!initDataStr && process.env.NODE_ENV === "development") {
        const mockUser = { id: 99999, first_name: "LocalRunner", username: "local_runner" };
        initDataStr = `user=${encodeURIComponent(JSON.stringify(mockUser))}&hash=mock_hash`;
      }
      setInitData(initDataStr);

      // LocalStorage High Score Setup
      const stored = localStorage.getItem("cybergrid_highscore");
      if (stored) {
        setHighScore(parseInt(stored, 10));
      }
    }
  }, []);

  // Fetch leaderboard once initData state is loaded
  useEffect(() => {
    fetchLeaderboard();
  }, [initData]);

  // Helper to fetch today's leaderboard scores
  const fetchLeaderboard = async () => {
    try {
      const res = await fetch("/api/scores");
      const data = await res.json();
      if (data.success) {
        setLeaderboard(data.leaderboard);
      }
    } catch (e) {
      console.error("Failed to fetch leaderboard:", e);
    }
  };

  // Helper to submit user score to backend database
  const submitScore = async (finalScore: number) => {
    if (!initData) return;

    try {
      const res = await fetch("/api/scores", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          initData,
          score: finalScore,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setLeaderboard(data.leaderboard);
      }
    } catch (e) {
      console.error("Failed to submit score:", e);
    }
  };

  // Haptic feedback wrappers
  const triggerHaptic = (style: "light" | "medium" | "heavy" | "rigid" | "soft") => {
    if (typeof window !== "undefined") {
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred(style);
    }
  };

  const triggerHapticNotification = (type: "success" | "error" | "warning") => {
    if (typeof window !== "undefined") {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred(type);
    }
  };

  // Main countdown timer (100ms ticks)
  useEffect(() => {
    if (!isPlaying) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 0.1) {
          clearInterval(timer);
          handleGameOver();
          return 0;
        }
        return parseFloat((prev - 0.1).toFixed(1));
      });
    }, 100);

    return () => clearInterval(timer);
  }, [isPlaying]);

  // Neon Red Target generator (Runs independently every 3 seconds)
  useEffect(() => {
    if (!isPlaying) {
      setRedIndex(null);
      return;
    }

    const redInterval = setInterval(() => {
      const currentGreen = greenIndexRef.current;
      
      // Choose random index that is not the current green index
      let newRed;
      let attempts = 0;
      do {
        newRed = Math.floor(Math.random() * 9);
        attempts++;
      } while (newRed === currentGreen && attempts < 10);

      setRedIndex(newRed);

      // Neon red target stays for exactly 1.0 second
      const redTimeout = setTimeout(() => {
        setRedIndex((curr) => (curr === newRed ? null : curr));
      }, 1000);

      return () => clearTimeout(redTimeout);
    }, 3000);

    return () => clearInterval(redInterval);
  }, [isPlaying]);

  // Start / Reboot the game
  const startGame = () => {
    triggerHaptic("medium");
    setActiveTab("game"); // Swap to game screen
    setScore(0);
    setTimeLeft(20.0);
    setIsNewHighScore(false);
    setShowGameOver(false);
    
    // Select first green grid item
    const firstGreen = Math.floor(Math.random() * 9);
    setGreenIndex(firstGreen);
    setRedIndex(null);
    setIsPlaying(true);
  };

  // Handle game over condition
  const handleGameOver = () => {
    setIsPlaying(false);
    setGreenIndex(null);
    setRedIndex(null);
    setShowGameOver(true);

    // Submit score to leaderboard database
    submitScore(score);

    if (score > highScore) {
      setHighScore(score);
      setIsNewHighScore(true);
      localStorage.setItem("cybergrid_highscore", score.toString());
      triggerHapticNotification("success");
    } else {
      triggerHapticNotification("error");
    }
  };

  // Grid Cell Click/Tap Handler
  const handleCellTap = (index: number) => {
    if (!isPlaying) {
      // Flash screen / shake grid to prompt START click
      setGridAnimation("shake");
      triggerHaptic("light");
      setTimeout(() => setGridAnimation(null), 400);
      return;
    }

    if (index === greenIndex) {
      // Success! Green click
      triggerHaptic("light");
      setScore((s) => s + 1);
      setTimeLeft((t) => parseFloat(Math.min(t + 0.5, 99.9).toFixed(1)));
      
      // Move green to a new cell
      let nextGreen;
      do {
        nextGreen = Math.floor(Math.random() * 9);
      } while (nextGreen === index);
      
      setGreenIndex(nextGreen);

      // If green moved to the cell currently occupied by red, clear red
      if (nextGreen === redIndex) {
        setRedIndex(null);
      }
    } else if (index === redIndex) {
      // Penalty! Red click
      triggerHaptic("heavy");
      setTimeLeft((t) => parseFloat(Math.max(t - 1.5, 0).toFixed(1)));
      setRedIndex(null);
      
      // Quick screen flash effect
      setGridAnimation("red-flash");
      setTimeout(() => setGridAnimation(null), 300);
    } else {
      // Missed tap
      triggerHaptic("soft");
    }
  };

  const displayHighScore = Math.max(score, highScore);

  return (
    <main className="cyber-grid-bg relative w-full h-[100dvh] flex flex-col justify-between items-center py-4 px-6 overflow-hidden select-none">
      
      {/* Top Header Section */}
      <div className="w-full flex flex-col items-center gap-1.5 z-10">
        <div className="w-full flex justify-between items-center border-b border-cyan-500/20 pb-2">
          <div className="flex flex-col">
            <span className="text-[10px] tracking-widest text-cyan-400/50 uppercase font-mono">
              SYSTEM // USER
            </span>
            <span className="text-sm font-bold text-neon-cyan tracking-wider truncate max-w-[150px]">
              {userName}
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isPlaying ? "bg-neon-green" : "bg-neon-red"}`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${isPlaying ? "bg-neon-green" : "bg-neon-red"}`}></span>
            </span>
            <span className="text-[10px] tracking-widest text-gray-400 font-mono uppercase">
              {isPlaying ? "STATUS: ACTIVE" : "STATUS: STBY"}
            </span>
          </div>
        </div>

        {/* Brand Title */}
        <h1 className="text-xl font-black tracking-[0.2em] text-neon-cyan animate-cyber-flicker mt-1">
          CYBER GRID
        </h1>
      </div>

      {/* Stats Counter & Timer Row */}
      <div className="w-full max-w-[340px] grid grid-cols-3 gap-2.5 z-10">
        <div className="cyber-box bg-cyber-dark/80 p-2 flex flex-col items-center justify-center rounded border-cyan-500/30">
          <span className="text-[9px] tracking-wider text-cyan-400/40 uppercase font-mono">Score</span>
          <span className="text-lg font-black text-neon-green">{score}</span>
        </div>
        
        <div className="cyber-box bg-cyber-dark/80 p-2 flex flex-col items-center justify-center rounded border-cyan-500/30">
          <span className="text-[9px] tracking-wider text-cyan-400/40 uppercase font-mono">High Score</span>
          <span className="text-lg font-black text-neon-yellow">{displayHighScore}</span>
        </div>

        <div className={`cyber-box p-2 flex flex-col items-center justify-center rounded border-cyan-500/30 transition-all duration-300 ${isPlaying && timeLeft < 5.0 ? "bg-neon-red/10 animate-pulse border-neon-red" : "bg-cyber-dark/80"}`}>
          <span className="text-[9px] tracking-wider text-cyan-400/40 uppercase font-mono">Time</span>
          <span className={`text-lg font-black tracking-wide ${isPlaying && timeLeft < 5.0 ? "text-neon-red" : "text-neon-cyan"}`}>
            {timeLeft.toFixed(1)}s
          </span>
        </div>
      </div>

      {/* Main Tab Area (Aspect-Square cards matching exactly in dimensions) */}
      <div className="w-full max-w-[320px] aspect-square z-10 relative">
        {activeTab === "game" ? (
          /* 3x3 Interaction Grid */
          <div 
            className={`w-full h-full grid grid-cols-3 gap-3.5 transition-all duration-200 
              ${gridAnimation === "shake" ? "animate-[bounce_0.2s_infinite]" : ""}
              ${gridAnimation === "red-flash" ? "bg-neon-red/15 rounded-xl border border-neon-red/30 shadow-[0_0_30px_rgba(255,49,49,0.3)]" : ""}
            `}
          >
            {Array.from({ length: 9 }).map((_, idx) => {
              const isGreen = idx === greenIndex;
              const isRed = idx === redIndex;
              
              return (
                <button
                  key={idx}
                  onClick={() => handleCellTap(idx)}
                  className={`relative rounded-xl flex items-center justify-center overflow-hidden transition-all duration-100 outline-none select-none touch-manipulation active:scale-90
                    ${
                      isGreen
                        ? "bg-neon-green text-black border-2 border-neon-green shadow-[0_0_20px_rgba(57,255,20,0.6)] animate-neon-pulse-green cursor-pointer font-bold"
                        : isRed
                        ? "bg-neon-red text-white border-2 border-neon-red shadow-[0_0_25px_rgba(255,49,49,0.8)] animate-neon-pulse-red cursor-pointer"
                        : "btn-cyber-inactive text-cyan-400/20 cursor-default"
                    }
                  `}
                >
                  <div className="absolute inset-1 border border-cyan-400/5 pointer-events-none rounded-lg" />
                  {isGreen && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-[11px] font-mono tracking-tighter opacity-80 animate-pulse">TAP!</span>
                    </div>
                  )}
                  {isRed && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-[11px] font-mono tracking-tighter opacity-90 animate-pulse">AVOID</span>
                    </div>
                  )}
                  {!isGreen && !isRed && (
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-400/10" />
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          /* Cyber Leaderboard Screen */
          <div className="w-full h-full cyber-box bg-cyber-dark/95 border-cyan-500/20 rounded-xl p-3 flex flex-col justify-between shadow-[inset_0_0_15px_rgba(0,240,255,0.05)]">
            <div className="flex justify-between items-center border-b border-cyan-500/20 pb-1.5 mb-2">
              <span className="text-[10px] tracking-wider text-neon-cyan font-mono uppercase">
                DAILY TOP RUNNERS // UTC
              </span>
              <button 
                onClick={fetchLeaderboard}
                className="text-[9px] font-mono text-cyan-400/50 hover:text-neon-cyan active:scale-95 transition-all"
              >
                [REFRESH]
              </button>
            </div>
            
            {/* Scrollable Rank List */}
            <div className="flex-1 overflow-y-auto space-y-1 pr-1">
              {leaderboard.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <span className="text-[10px] font-mono text-gray-500 tracking-widest uppercase animate-pulse">
                    NO CYBER RECORDS TODAY
                  </span>
                </div>
              ) : (
                leaderboard.slice(0, 10).map((entry, idx) => {
                  const rank = idx + 1;
                  const isTop3 = rank <= 3;
                  
                  return (
                    <div 
                      key={idx}
                      className={`flex justify-between items-center p-1.5 rounded border text-[11px] font-mono
                        ${
                          rank === 1 
                            ? "bg-neon-green/5 border-neon-green/30 text-neon-green" 
                            : rank === 2 
                            ? "bg-neon-yellow/5 border-neon-yellow/30 text-neon-yellow"
                            : rank === 3 
                            ? "bg-neon-cyan/5 border-neon-cyan/30 text-neon-cyan"
                            : "bg-black/40 border-white/5 text-gray-400"
                        }
                      `}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`font-black w-4 text-center ${isTop3 ? "text-xs" : "opacity-40"}`}>
                          {rank < 10 ? `0${rank}` : rank}
                        </span>
                        <span className="truncate max-w-[150px]">{entry.user}</span>
                      </div>
                      <span className={`font-black ${isTop3 ? "" : "text-gray-300"}`}>
                        {entry.score} <span className="text-[8px] opacity-60">PTS</span>
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Control & Tab Selection Footer */}
      <div className="w-full max-w-[320px] flex flex-col items-center gap-3.5 z-10 pb-1">
        
        {/* Play Action / System Logger Row */}
        <div className="w-full h-11 flex items-center justify-center">
          {!isPlaying ? (
            <button
              onClick={startGame}
              className="cyber-box w-full bg-neon-cyan/10 hover:bg-neon-cyan/20 text-neon-cyan py-2.5 px-6 rounded-lg text-xs font-bold tracking-[0.25em] uppercase transition-all duration-200 border-neon-cyan shadow-[0_0_15px_rgba(0,240,255,0.2)] active:scale-95 text-center cursor-pointer"
            >
              INITIALIZE RUN
            </button>
          ) : (
            <span className="text-[10px] text-gray-500/80 font-mono tracking-widest uppercase animate-pulse text-center">
              [SYS] CAPTURING GRID BEACONS...
            </span>
          )}
        </div>

        {/* Tab Selection buttons */}
        <div className="w-full grid grid-cols-2 gap-2 border-t border-white/5 pt-3">
          <button
            disabled={isPlaying}
            onClick={() => setActiveTab("game")}
            className={`py-1.5 px-3 rounded text-[10px] font-mono tracking-widest uppercase transition-all cursor-pointer text-center
              ${isPlaying ? "opacity-30 cursor-not-allowed" : ""}
              ${
                activeTab === "game"
                  ? "bg-neon-cyan/15 text-neon-cyan border border-neon-cyan/30 shadow-[0_0_8px_rgba(0,240,255,0.15)]"
                  : "bg-cyber-dark/40 text-gray-500 border border-transparent hover:text-cyan-400/60"
              }
            `}
          >
            [ GRID ARENA ]
          </button>
          
          <button
            disabled={isPlaying}
            onClick={() => setActiveTab("leaderboard")}
            className={`py-1.5 px-3 rounded text-[10px] font-mono tracking-widest uppercase transition-all cursor-pointer text-center
              ${isPlaying ? "opacity-30 cursor-not-allowed" : ""}
              ${
                activeTab === "leaderboard"
                  ? "bg-neon-cyan/15 text-neon-cyan border border-neon-cyan/30 shadow-[0_0_8px_rgba(0,240,255,0.15)]"
                  : "bg-cyber-dark/40 text-gray-500 border border-transparent hover:text-cyan-400/60"
              }
            `}
          >
            [ LEADERBOARD ]
          </button>
        </div>
      </div>

      {/* Game Over Modal Overlay */}
      {showGameOver && (
        <div className="absolute inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-6 z-50 animate-fade-in">
          <div className="cyber-box w-full max-w-[300px] bg-cyber-dark border-neon-red shadow-[0_0_30px_rgba(255,49,49,0.35)] p-6 rounded-lg flex flex-col items-center text-center gap-5">
            <div>
              <h2 className="text-neon-red font-black text-lg tracking-[0.15em] uppercase mb-1">
                SYSTEM MALFUNCTION
              </h2>
              <span className="text-[10px] font-mono tracking-widest text-red-500/60 uppercase">
                Grid Runner Disconnected
              </span>
            </div>

            <div className="w-full flex flex-col gap-2 bg-black/50 p-4 rounded border border-red-500/10">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-400 font-mono">GRID HARVEST:</span>
                <span className="text-lg font-black text-neon-green">{score}</span>
              </div>
              <div className="flex justify-between items-center border-t border-white/5 pt-2">
                <span className="text-xs text-gray-400 font-mono">PEAK HARVEST:</span>
                <span className="text-lg font-black text-neon-yellow">{displayHighScore}</span>
              </div>
              {isNewHighScore && (
                <div className="text-[10px] font-mono text-neon-yellow animate-bounce tracking-widest mt-2">
                  ▲ NEW HIGH RECORD ▲
                </div>
              )}
            </div>

            <div className="w-full flex flex-col gap-2">
              <button
                onClick={startGame}
                className="cyber-box w-full bg-neon-green/10 hover:bg-neon-green/20 text-neon-green py-2.5 px-6 rounded text-xs font-bold tracking-[0.2em] uppercase transition-all duration-200 border-neon-green shadow-[0_0_15px_rgba(57,255,20,0.15)] active:scale-95 cursor-pointer"
              >
                REBOOT SYSTEM
              </button>
              
              <button
                onClick={() => {
                  setShowGameOver(false);
                  setActiveTab("leaderboard");
                  fetchLeaderboard();
                }}
                className="w-full text-[10px] font-mono text-cyan-400/50 hover:text-neon-cyan py-1 cursor-pointer transition-all uppercase"
              >
                [ VIEW LEADERBOARD ]
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
