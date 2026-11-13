import React, { useState, useEffect, useRef } from "react";
import { 
  Mic, 
  MicOff, 
  Volume2, 
  X, 
  Sparkles, 
  Radio, 
  AlertCircle, 
  CheckCircle2, 
  RefreshCw,
  PhoneOff,
  Bot
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface LiveVoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function LiveVoiceModal({ isOpen, onClose }: LiveVoiceModalProps) {
  const [status, setStatus] = useState<"disconnected" | "connecting" | "connected" | "speaking" | "error">("disconnected");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState<{ id: string; text: string; sender: "user" | "ai" }[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const isMutedRef = useRef(isMuted);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    if (isOpen) {
      startLiveSession();
    } else {
      stopLiveSession();
    }

    return () => {
      stopLiveSession();
    };
  }, [isOpen]);

  const startLiveSession = async () => {
    setStatus("connecting");
    setErrorMessage(null);

    try {
      // 1. Microphone access & setup (16kHz PCM)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const inputAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      inputAudioCtxRef.current = inputAudioCtx;

      const outputAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      outputAudioCtxRef.current = outputAudioCtx;
      nextStartTimeRef.current = outputAudioCtx.currentTime;

      // 2. Setup WebSocket connection to /live
      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${location.host}/live`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[LiveVoiceModal] Connected to /live socket");
        setStatus("connected");

        // Start processing mic input after socket opens
        const source = inputAudioCtx.createMediaStreamSource(stream);
        const processor = inputAudioCtx.createScriptProcessor(4096, 1, 1);
        scriptProcessorRef.current = processor;

        source.connect(processor);
        processor.connect(inputAudioCtx.destination);

        processor.onaudioprocess = (e) => {
          if (isMutedRef.current) return;
          if (ws.readyState !== WebSocket.OPEN) return;

          const inputData = e.inputBuffer.getChannelData(0);
          const pcm16 = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            const s = Math.max(-1, Math.min(1, inputData[i]));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }

          const bytes = new Uint8Array(pcm16.buffer);
          let binary = "";
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64Audio = btoa(binary);

          ws.send(JSON.stringify({ audio: base64Audio }));
        };
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.error) {
            console.error("[LiveVoiceModal] Received error from server:", data.error);
            setErrorMessage(data.error);
            setStatus("error");
            return;
          }

          if (data.interrupted) {
            if (outputAudioCtxRef.current) {
              nextStartTimeRef.current = outputAudioCtxRef.current.currentTime;
            }
            setStatus("connected");
            return;
          }

          if (data.audio) {
            setStatus("speaking");
            playAudioChunk(data.audio);
          }
        } catch (err) {
          console.error("[LiveVoiceModal] Socket message parse error:", err);
        }
      };

      ws.onerror = (err) => {
        console.error("[LiveVoiceModal] WebSocket error:", err);
        setErrorMessage("Səsli serverlə əlaqə xətası yarandı.");
        setStatus("error");
      };

      ws.onclose = () => {
        console.log("[LiveVoiceModal] WebSocket closed");
        if (status !== "error") {
          setStatus("disconnected");
        }
      };

    } catch (err: any) {
      console.error("[LiveVoiceModal] Initialization error:", err);
      setErrorMessage(err.message || "Mikrofon icazəsi verilmədi və ya dəstəklənmir.");
      setStatus("error");
    }
  };

  const playAudioChunk = (base64Audio: string) => {
    const ctx = outputAudioCtxRef.current;
    if (!ctx) return;

    try {
      const binary = atob(base64Audio);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const int16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768.0;
      }

      const buffer = ctx.createBuffer(1, float32.length, 24000);
      buffer.getChannelData(0).set(float32);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);

      const currentTime = ctx.currentTime;
      if (nextStartTimeRef.current < currentTime) {
        nextStartTimeRef.current = currentTime;
      }

      source.start(nextStartTimeRef.current);
      nextStartTimeRef.current += buffer.duration;

      source.onended = () => {
        if (ctx.currentTime >= nextStartTimeRef.current - 0.1) {
          setStatus("connected");
        }
      };
    } catch (err) {
      console.error("[LiveVoiceModal] Error playing audio chunk:", err);
    }
  };

  const stopLiveSession = () => {
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (inputAudioCtxRef.current) {
      inputAudioCtxRef.current.close().catch(() => {});
      inputAudioCtxRef.current = null;
    }
    if (outputAudioCtxRef.current) {
      outputAudioCtxRef.current.close().catch(() => {});
      outputAudioCtxRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus("disconnected");
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="bg-slate-950 border border-slate-800 text-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden relative flex flex-col"
        >
          {/* Header */}
          <div className="p-5 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/50">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-tr from-indigo-600 to-blue-500 rounded-2xl shadow-md text-white">
                <Sparkles className="w-5 h-5 animate-spin-slow" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold flex items-center gap-2">
                  <span>Gemini Live AI Voice</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    Live API 3.1
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400 font-medium">Real-vaxt səsli həmsöhbət köməkçisi</p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Central Animated Orb & Visualizer */}
          <div className="p-8 flex flex-col items-center justify-center space-y-6 relative overflow-hidden min-h-[280px]">
            {/* Background Glow */}
            <div className={`absolute w-64 h-64 rounded-full blur-3xl transition-all duration-700 pointer-events-none ${
              status === "speaking" ? "bg-indigo-500/30 scale-125" :
              status === "connected" ? "bg-emerald-500/20 scale-100" :
              status === "connecting" ? "bg-amber-500/20" :
              "bg-rose-500/20"
            }`}></div>

            {/* Glowing Orb */}
            <div className="relative flex items-center justify-center">
              {/* Pulsing Outer Rings */}
              {status === "speaking" && (
                <>
                  <div className="absolute w-40 h-40 rounded-full border border-indigo-500/40 opacity-75"></div>
                  <div className="absolute w-48 h-48 rounded-full border border-blue-400/30"></div>
                </>
              )}
              {status === "connected" && !isMuted && (
                <div className="absolute w-36 h-36 rounded-full border border-emerald-500/30"></div>
              )}

              <div className={`w-28 h-28 rounded-full flex items-center justify-center shadow-2xl border transition-all duration-500 relative z-10 ${
                status === "speaking" ? "bg-gradient-to-tr from-indigo-600 via-blue-600 to-cyan-500 border-indigo-300 shadow-indigo-500/50 scale-105" :
                status === "connected" ? "bg-slate-900 border-emerald-500/50 text-emerald-400 shadow-emerald-500/20" :
                status === "connecting" ? "bg-slate-900 border-amber-500/50 text-amber-400" :
                "bg-slate-900 border-rose-500/50 text-rose-400"
              }`}>
                {status === "speaking" ? (
                  <Volume2 className="w-10 h-10 text-white animate-bounce" />
                ) : status === "connected" ? (
                  isMuted ? <MicOff className="w-10 h-10 text-slate-500" /> : <Mic className="w-10 h-10 text-emerald-400" />
                ) : status === "connecting" ? (
                  <RefreshCw className="w-10 h-10 text-amber-400 animate-spin" />
                ) : (
                  <AlertCircle className="w-10 h-10 text-rose-400" />
                )}
              </div>
            </div>

            {/* Status Pill */}
            <div className="z-10 text-center space-y-1">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 text-xs font-semibold">
                <span className={`w-2 h-2 rounded-full ${
                  status === "speaking" ? "bg-indigo-400" :
                  status === "connected" ? (isMuted ? "bg-slate-500" : "bg-emerald-400") :
                  status === "connecting" ? "bg-amber-400 animate-spin" :
                  "bg-rose-500"
                }`}></span>
                <span className="text-slate-200">
                  {status === "speaking" && "Gemini Cavab Verir..."}
                  {status === "connected" && (isMuted ? "Mikrofon Sönülüdür" : "Səsiniz Dinlənilir (Danışa bilərsiniz)...")}
                  {status === "connecting" && "Səsli AI Serverə Qoşulur..."}
                  {status === "error" && "Əlaqə Xətası Baş Verdi"}
                  {status === "disconnected" && "Əlaqə kəsildi"}
                </span>
              </div>

              {errorMessage && (
                <p className="text-xs text-rose-400 font-medium pt-1 max-w-xs mx-auto">
                  {errorMessage}
                </p>
              )}
            </div>

            {/* Equalizer Audio Bar Animation */}
            {status === "speaking" && (
              <div className="flex items-center gap-1 h-8 pt-2 z-10">
                {[...Array(12)].map((_, i) => (
                  <motion.div
                    key={i}
                    animate={{
                      height: [8, Math.random() * 28 + 8, 8]
                    }}
                    transition={{
                      repeat: Infinity,
                      duration: 0.4 + (i % 3) * 0.1,
                      ease: "easeInOut"
                    }}
                    className="w-1.5 bg-gradient-to-t from-indigo-500 to-cyan-400 rounded-full"
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer Control Panel */}
          <div className="p-5 border-t border-slate-800/80 bg-slate-900/60 flex items-center justify-between gap-4">
            <button
              onClick={() => setIsMuted(!isMuted)}
              disabled={status !== "connected" && status !== "speaking"}
              className={`flex-1 py-3 px-4 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 border transition-all cursor-pointer disabled:opacity-50 ${
                isMuted 
                  ? "bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30" 
                  : "bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700"
              }`}
            >
              {isMuted ? (
                <>
                  <MicOff className="w-4 h-4 text-rose-400" />
                  <span>Mikrofonu Aç</span>
                </>
              ) : (
                <>
                  <Mic className="w-4 h-4 text-emerald-400" />
                  <span>Səsi Söndür (Mute)</span>
                </>
              )}
            </button>

            {status === "error" ? (
              <button
                onClick={startLiveSession}
                className="py-3 px-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Yenidən Qoşul</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  stopLiveSession();
                  onClose();
                }}
                className="py-3 px-5 bg-rose-600 hover:bg-rose-500 text-white rounded-2xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-rose-600/30"
              >
                <PhoneOff className="w-4 h-4" />
                <span>Zəngi Bitir</span>
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
