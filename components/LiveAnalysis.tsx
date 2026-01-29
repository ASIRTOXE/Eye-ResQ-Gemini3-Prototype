import React, { useRef, useState, useEffect } from 'react';
import { AlertTriangle, Activity, Volume2, VolumeX, RefreshCw, SwitchCamera, PlayCircle, WifiOff } from 'lucide-react';
import { analyzeLiveFrame } from '../services/geminiService';

const LiveAnalysis: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const demoCanvasRef = useRef<HTMLCanvasElement>(null);
  
  // Refs for state accessed inside intervals (to solve closure staleness)
  const isDemoModeRef = useRef(false);
  const isAudioEnabledRef = useRef(true);
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<string>("INITIALIZING LINK...");
  const [isDanger, setIsDanger] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(false);
  
  // Camera state
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment' | undefined>(undefined);
  
  const analysisInterval = useRef<number | null>(null);
  const demoAnimationRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Sync state to refs
  useEffect(() => {
    isDemoModeRef.current = isDemoMode;
  }, [isDemoMode]);

  useEffect(() => {
    isAudioEnabledRef.current = isAudioEnabled;
  }, [isAudioEnabled]);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
      stopDemoMode();
    };
  }, []);

  const toggleCamera = async () => {
    if (isDemoMode) return;
    const newMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newMode);
    await startCamera(newMode);
  };

  const startCamera = async (overrideFacingMode?: 'user' | 'environment') => {
    stopCamera(); 
    stopDemoMode();
    setError(null);
    setDemoModeState(false);
    
    const targetFacingMode = overrideFacingMode !== undefined ? overrideFacingMode : facingMode;
    
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera API is not supported in this browser.");
      }

      // Check for devices - purely informational
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        setHasMultipleCameras(videoDevices.length > 1);
      } catch (e) {
        console.warn("Device enumeration failed:", e);
      }

      let stream: MediaStream;

      try {
        const constraints: MediaStreamConstraints = {
          video: targetFacingMode ? { facingMode: targetFacingMode } : true,
          audio: false
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (firstErr: any) {
        console.warn(`Camera start failed with mode ${targetFacingMode}, attempting fallback...`, firstErr);
        
        try {
            // Fallback to most basic constraint
            stream = await navigator.mediaDevices.getUserMedia({ 
                video: true, 
                audio: false 
            });
            if (targetFacingMode) setFacingMode(undefined); 
        } catch (secondErr: any) {
            throw secondErr;
        }
      }

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().catch(e => console.error("Play error:", e));
        };
      }
      
      startAnalysis();

    } catch (err: any) {
      // Suppress "Error accessing camera" for "Requested device not found" and other common errors
      // Instead of logging an error, we log a warning and fallback gracefully.
      console.warn("Camera initialization failed, switching to Simulation Mode:", err.message || err);
      
      // Unconditional fallback to Demo Mode for any camera initialization error
      startDemoMode();
    }
  };

  const stopCamera = () => {
    if (analysisInterval.current) {
        window.clearInterval(analysisInterval.current);
        analysisInterval.current = null;
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const stopDemoMode = () => {
     if (demoAnimationRef.current) {
         cancelAnimationFrame(demoAnimationRef.current);
         demoAnimationRef.current = null;
     }
  }

  const setDemoModeState = (enabled: boolean) => {
      setIsDemoMode(enabled);
      isDemoModeRef.current = enabled;
  }

  const simulateSignalLoss = () => {
    stopCamera();
    stopDemoMode();
    setError("CONNECTION TERMINATED // MANUAL OVERRIDE");
  };

  const startDemoMode = () => {
    stopCamera();
    setError(null);
    setDemoModeState(true);
    setCurrentStatus("SIMULATION ACTIVE // SCANNING SYNTHETIC FEED");
    
    // Start animation loop
    const animate = () => {
        if (!demoCanvasRef.current) return;
        const ctx = demoCanvasRef.current.getContext('2d');
        if (!ctx) return;
        
        const w = demoCanvasRef.current.width;
        const h = demoCanvasRef.current.height;
        const time = Date.now() / 1000;
        
        // Dark tactical background
        ctx.fillStyle = '#020617'; // Slate 950
        ctx.fillRect(0, 0, w, h);
        
        // Grid
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1;
        const gridSize = 40;
        
        // Moving Grid
        const offset = (time * 20) % gridSize;
        
        ctx.beginPath();
        for(let x = 0; x < w; x += gridSize) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
        }
        for(let y = offset - gridSize; y < h; y += gridSize) {
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
        }
        ctx.stroke();
        
        // Radar Sweep
        ctx.save();
        ctx.translate(w/2, h/2);
        ctx.rotate(time * 2);
        const gradient = ctx.createLinearGradient(0, 0, w/2, 0);
        gradient.addColorStop(0, 'rgba(249, 115, 22, 0)');
        gradient.addColorStop(1, 'rgba(249, 115, 22, 0.2)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(0,0);
        ctx.arc(0, 0, Math.max(w,h), 0, 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        
        // Random Blips
        if (Math.random() > 0.95) {
             const bx = Math.random() * w;
             const by = Math.random() * h;
             ctx.fillStyle = 'rgba(239, 68, 68, 0.8)';
             ctx.beginPath();
             ctx.arc(bx, by, 5, 0, Math.PI * 2);
             ctx.fill();
        }
        
        demoAnimationRef.current = requestAnimationFrame(animate);
    };
    
    // Initialize canvas size and start analysis after a short delay to allow React to render the canvas
    setTimeout(() => {
        if (demoCanvasRef.current) {
            demoCanvasRef.current.width = 640;
            demoCanvasRef.current.height = 360;
            animate();
            startAnalysis(); // Start analyzing the canvas
        } else {
            // Retry once if canvas not yet ready
            setTimeout(() => {
                if (demoCanvasRef.current) {
                    demoCanvasRef.current.width = 640;
                    demoCanvasRef.current.height = 360;
                    animate();
                    startAnalysis();
                }
            }, 200);
        }
    }, 100);
  };

  const startAnalysis = () => {
    if (analysisInterval.current) clearInterval(analysisInterval.current);

    // INCREASED INTERVAL TO 6 SECONDS TO PREVENT 429 ERRORS
    analysisInterval.current = window.setInterval(async () => {
      let base64Image = '';
      
      const inDemoMode = isDemoModeRef.current; // Use Ref for fresh value inside interval

      if (inDemoMode) {
          if (!demoCanvasRef.current) return;
          base64Image = demoCanvasRef.current.toDataURL('image/jpeg', 0.8);
      } else {
          if (!videoRef.current || !canvasRef.current) return;
          if (videoRef.current.readyState !== 4) return;
          
          const context = canvasRef.current.getContext('2d');
          if (context) {
            canvasRef.current.width = videoRef.current.videoWidth;
            canvasRef.current.height = videoRef.current.videoHeight;
            context.drawImage(videoRef.current, 0, 0);
            base64Image = canvasRef.current.toDataURL('image/jpeg', 0.8);
          }
      }
      
      if (!base64Image) return;

      setIsAnalyzing(true);
        
      try {
          const result = await analyzeLiveFrame(base64Image);
          handleAnalysisResult(result);
      } catch (err) {
          console.error("Frame analysis failed", err);
      }
      
      setIsAnalyzing(false);
    }, 6000); 
  };

  const handleAnalysisResult = (text: string) => {
    const cleanText = text.trim();
    setCurrentStatus(cleanText);

    // If Rate Limit message, treat as Alert (Red)
    const isSafe = cleanText.toUpperCase().includes("SAFE");
    setIsDanger(!isSafe);

    if (!isSafe && isAudioEnabledRef.current) { // Use Ref for fresh value
      speakAlert(cleanText);
    }
  };

  const speakAlert = (text: string) => {
    if (!window.speechSynthesis) return;
    if (window.speechSynthesis.speaking) return;

    // Don't speak technical error messages like "Rate Limit" repeatedly
    if (text.includes("RATE LIMIT") || text.includes("STANDBY")) return;

    const speechText = text.replace(/^ALERT:/i, "").trim();
    const utterance = new SpeechSynthesisUtterance(speechText);
    utterance.rate = 1.1;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  };

  const handleAudioToggle = () => {
      const newState = !isAudioEnabled;
      setIsAudioEnabled(newState);
      isAudioEnabledRef.current = newState;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 bg-slate-900 border border-slate-800 rounded-xl p-8 text-center shadow-2xl">
        <div className="w-16 h-16 bg-red-900/30 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8 text-red-500" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Signal Lost</h3>
        <p className="text-slate-400 mt-0 max-w-md text-sm mb-6">{error}</p>
        <div className="flex gap-4">
            <button 
                onClick={() => startCamera()}
                className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors flex items-center gap-2 border border-slate-700"
            >
                <RefreshCw className="w-4 h-4" />
                Retry Feed
            </button>
            <button 
                onClick={startDemoMode}
                className="px-6 py-3 bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-orange-900/20"
            >
                <PlayCircle className="w-4 h-4" />
                Start Simulation
            </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative w-full overflow-hidden rounded-2xl border-2 transition-all duration-300 ${isDanger ? 'border-red-600 shadow-[0_0_50px_rgba(220,38,38,0.5)]' : 'border-slate-700 shadow-2xl'}`}>
      {/* Hidden canvas for capturing video frames */}
      <canvas ref={canvasRef} className="hidden" />

      <div className="relative aspect-video bg-black group">
        
        {isDemoMode ? (
            <canvas 
                ref={demoCanvasRef} 
                className="w-full h-full object-cover"
            />
        ) : (
            <video 
              ref={videoRef} 
              className="w-full h-full object-cover" 
              muted 
              playsInline
            />
        )}
        
        {/* HUD Overlay */}
        <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4 md:p-6">
            <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                    <span className="relative flex h-3 w-3">
                        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isDemoMode ? 'bg-orange-400' : 'bg-red-400'}`}></span>
                        <span className={`relative inline-flex rounded-full h-3 w-3 ${isDemoMode ? 'bg-orange-500' : 'bg-red-500'}`}></span>
                    </span>
                    <span className={`font-mono font-bold tracking-wider bg-black/60 backdrop-blur-sm px-3 py-1 rounded border text-xs md:text-sm ${isDemoMode ? 'text-orange-500 border-orange-500/30' : 'text-red-500 border-red-500/30'}`}>
                        {isDemoMode ? 'SIMULATION MODE' : `LIVE FEED // ${facingMode === 'environment' ? 'REAR' : 'FRONT'} CAM`}
                    </span>
                </div>
                
                <div className="flex gap-2 pointer-events-auto">
                    {!isDemoMode && hasMultipleCameras && (
                        <button 
                            onClick={toggleCamera}
                            className="p-2.5 bg-black/60 hover:bg-slate-800 border border-slate-700 rounded-lg text-white backdrop-blur-sm transition-colors"
                            title="Switch Camera"
                        >
                            <SwitchCamera className="w-5 h-5" />
                        </button>
                    )}
                    <button 
                        onClick={handleAudioToggle}
                        className={`p-2.5 bg-black/60 border rounded-lg text-white backdrop-blur-sm transition-colors ${isAudioEnabled ? 'border-slate-700 hover:bg-slate-800' : 'border-red-500/50 bg-red-900/20 text-red-400'}`}
                        title={isAudioEnabled ? "Mute Alerts" : "Enable Audio"}
                    >
                        {isAudioEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                    </button>

                    <button
                        onClick={simulateSignalLoss}
                        className="p-2.5 bg-black/60 border border-slate-700 hover:bg-red-900/30 hover:border-red-500 hover:text-red-500 rounded-lg text-white backdrop-blur-sm transition-colors"
                        title="Simulate Signal Loss"
                    >
                        <WifiOff className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Central Target Reticle */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 md:w-48 md:h-48 border border-white/10 rounded-full flex items-center justify-center opacity-30 pointer-events-none">
                <div className="w-1 h-4 bg-white/50 absolute top-0 left-1/2 -translate-x-1/2"></div>
                <div className="w-1 h-4 bg-white/50 absolute bottom-0 left-1/2 -translate-x-1/2"></div>
                <div className="h-1 w-4 bg-white/50 absolute left-0 top-1/2 -translate-y-1/2"></div>
                <div className="h-1 w-4 bg-white/50 absolute right-0 top-1/2 -translate-y-1/2"></div>
                <div className={`w-2 h-2 rounded-full animate-pulse ${isDanger ? 'bg-red-500/50' : 'bg-green-500/50'}`}></div>
            </div>

            {/* Status Bar */}
            <div className={`mt-auto backdrop-blur-md border rounded-xl p-4 transition-colors duration-500 ${isDanger ? 'bg-red-950/90 border-red-500' : 'bg-slate-900/90 border-slate-600'}`}>
                <div className="flex items-center gap-4">
                    {isAnalyzing ? (
                         <div className="relative w-10 h-10 flex-shrink-0">
                             <div className="absolute inset-0 border-2 border-slate-600 rounded-full"></div>
                             <div className="absolute inset-0 border-2 border-orange-500 rounded-full border-t-transparent animate-spin"></div>
                         </div>
                    ) : (
                        <div className={`p-2 rounded-lg flex-shrink-0 ${isDanger ? 'bg-red-500/20 text-red-500' : 'bg-green-500/20 text-green-500'}`}>
                            {isDanger ? <AlertTriangle className="w-6 h-6 animate-pulse" /> : <Activity className="w-6 h-6" />}
                        </div>
                    )}
                    
                    <div className="flex-grow overflow-hidden">
                        <h4 className={`text-xs font-bold uppercase tracking-widest mb-1 ${isDanger ? 'text-red-400' : 'text-green-400'}`}>
                            {isDanger ? '⚠️ THREAT DETECTED' : '✅ SYSTEM NOMINAL'}
                        </h4>
                        <p className="text-lg md:text-xl font-mono text-white truncate">
                            {currentStatus}
                        </p>
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default LiveAnalysis;