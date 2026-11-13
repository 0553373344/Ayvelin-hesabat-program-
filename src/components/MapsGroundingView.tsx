import React, { useState, useEffect } from "react";
import { 
  MapPin, 
  Search, 
  Sparkles, 
  ExternalLink, 
  Navigation, 
  Compass, 
  Building2, 
  Star, 
  Send,
  Loader2,
  CheckCircle2,
  Map,
  MapPinned
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export default function MapsGroundingView() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultText, setResultText] = useState<string | null>(null);
  const [groundingChunks, setGroundingChunks] = useState<any[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedCity, setSelectedCity] = useState("Bakı");

  const cityCoordinates: Record<string, { lat: number; lng: number }> = {
    "Bakı": { lat: 40.409264, lng: 49.867092 },
    "Sumqayıt": { lat: 40.589722, lng: 49.668611 },
    "Gəncə": { lat: 40.682778, lng: 46.360556 },
    "Yevlax": { lat: 40.618333, lng: 47.150000 },
    "Şəki": { lat: 41.191944, lng: 47.170556 },
    "Şirvan": { lat: 39.937778, lng: 48.929167 },
    "Lənkəran": { lat: 38.753889, lng: 48.851111 },
    "Quba": { lat: 41.361111, lng: 48.513333 }
  };

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        (err) => {
          console.log("[MapsGroundingView] Geolocation denied/unavailable, using city default:", err);
        }
      );
    }
  }, []);

  const presets = [
    {
      title: "📍 Yevlax Mərkəzi Poçt və Filiallar",
      prompt: "Yevlax şəhərində yerləşən mərkəzi poçt şöbələrinin dəqiq ünvanları, poçt indeksləri və yerləşdiyi kuçələri xəritə üzərindən tapın.",
      city: "Yevlax"
    },
    {
      title: "📦 Bakı Kargo & Təhvil Məntəqələri",
      prompt: "Bakı şəhərində Nərimanov və Elmlər Akademiyası metrosu yaxınlığında fəaliyyət göstərən kargo və çatdırılma məntəqələrinin ünvanlarını xəritədə axtar.",
      city: "Bakı"
    },
    {
      title: "🚴 Gəncə Kuryer & Təhvil Mərkəzləri",
      prompt: "Gəncə şəhərində kuryerlərin rahat çatdırılması üçün məhsul təhvil və poçt nöqtələrinin ünvan və xəritə məlumatlarını göstər.",
      city: "Gəncə"
    },
    {
      title: "🏬 Sumqayıt Mərkəzi Poçt İndeksləri",
      prompt: "Sumqayıt şəhərinin poçt indeksləri, poçt şöbələrinin dəqiq xəritə ünvanları və əlaqə məlumatları hansılardır?",
      city: "Sumqayıt"
    }
  ];

  const handleSearch = async (textToSend: string, city: string = selectedCity) => {
    if (!textToSend.trim() || loading) return;
    setLoading(true);
    setResultText(null);
    setGroundingChunks([]);

    const coords = userLocation || cityCoordinates[city] || cityCoordinates["Bakı"];

    try {
      const res = await fetch("/api/gemini/maps-grounding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: textToSend,
          lat: coords.lat,
          lng: coords.lng
        })
      });

      const data = await res.json();
      if (res.ok) {
        setResultText(data.result || "Axtarış nəticəsi tapılmadı.");
        setGroundingChunks(data.groundingChunks || []);
      } else {
        setResultText(data.error || "Xəritə axtarışında xəta baş verdi.");
      }
    } catch (err) {
      console.error("[MapsGroundingView] Search error:", err);
      setResultText("Serverlə əlaqə saxlanarkən xəta yarandı.");
    } finally {
      setLoading(false);
    }
  };

  const renderFormattedResult = (text: string) => {
    return (
      <div className="space-y-2 text-slate-800 text-sm leading-relaxed">
        {text.split("\n").map((line, idx) => {
          let clean = line
            .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
            .replace(/\*(.*?)\*/g, "<em>$1</em>");

          if (!clean.trim()) return <div key={idx} className="h-2"></div>;

          return (
            <p key={idx} dangerouslySetInnerHTML={{ __html: clean }} />
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="p-6 bg-gradient-to-r from-emerald-700 via-teal-800 to-slate-900 text-white rounded-3xl shadow-xl relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1.5 z-10">
          <div className="inline-flex items-center gap-1.5 bg-white/10 px-3 py-1 rounded-full text-xs font-semibold backdrop-blur-md">
            <MapPinned className="w-4 h-4 text-emerald-300" />
            <span>Google Maps Grounding Engine</span>
          </div>
          <h2 className="text-xl md:text-2xl font-extrabold tracking-tight">Ünvan, Xəritə və Məkan Axtarışı</h2>
          <p className="text-xs text-emerald-100/80 font-medium">
            Google Maps canlı məlumatları ilə poçt şöbələri, kargo filialları, küçə ünvanları və dəqiq coğrafi yerləri tapın.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md border border-white/15 px-3 py-2 rounded-2xl shrink-0 z-10 self-start md:self-auto">
          <Navigation className="w-4 h-4 text-emerald-300 animate-pulse" />
          <div className="text-left font-mono text-[11px]">
            <p className="text-white/70">Aktiv Məkan Koordinatı</p>
            <p className="font-bold text-white">
              {userLocation 
                ? `${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)}` 
                : `${selectedCity} (${cityCoordinates[selectedCity]?.lat.toFixed(2)}, ${cityCoordinates[selectedCity]?.lng.toFixed(2)})`}
            </p>
          </div>
        </div>
      </div>

      {/* City Selector & Search Bar */}
      <div className="bg-white border border-slate-150 p-5 rounded-3xl shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2 text-slate-700 font-bold text-xs">
            <Compass className="w-4 h-4 text-emerald-600" />
            <span>Axtarış Şəhəri / Məntəqəsi:</span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {Object.keys(cityCoordinates).map((cityName) => (
              <button
                key={cityName}
                onClick={() => setSelectedCity(cityName)}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                  selectedCity === cityName
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {cityName}
              </button>
            ))}
          </div>
        </div>

        <form 
          onSubmit={(e) => {
            e.preventDefault();
            handleSearch(prompt);
          }}
          className="flex flex-col sm:flex-row gap-2.5"
        >
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-4 top-3.5" />
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ünvan və ya xəritə sorğunuzu yazın (Məs: Yevlaxda poçt indeksi və şöbə ünvanı)..."
              disabled={loading}
              className="w-full bg-slate-50 border border-slate-200 pl-11 pr-4 py-3 rounded-2xl text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-emerald-500 text-slate-800 disabled:opacity-70"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !prompt.trim()}
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold text-xs inline-flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer disabled:opacity-50 shrink-0"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Xəritədən Axtarılır...</span>
              </>
            ) : (
              <>
                <span>Google Maps Axtar</span>
                <Send className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </form>

        {/* Preset Prompt Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-2">
          {presets.map((item, idx) => (
            <button
              key={idx}
              onClick={() => {
                setPrompt(item.prompt);
                setSelectedCity(item.city);
                handleSearch(item.prompt, item.city);
              }}
              disabled={loading}
              className="p-3 text-left bg-slate-50 hover:bg-emerald-50/50 border border-slate-100 hover:border-emerald-200 rounded-2xl transition-all group cursor-pointer disabled:opacity-60"
            >
              <p className="text-xs font-bold text-slate-800 group-hover:text-emerald-700 flex items-center justify-between">
                <span>{item.title}</span>
                <MapPin className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600" />
              </p>
              <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">{item.prompt}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Search Output Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Main Text Answer */}
        <div className="lg:col-span-2 bg-white border border-slate-150 rounded-3xl p-6 shadow-xs space-y-4 min-h-[300px]">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900">Google Maps Cavab Məlumatı</h3>
            </div>
            {resultText && (
              <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                gemini-3.5-flash + googleMaps
              </span>
            )}
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-3 text-center">
              <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
              <p className="text-xs font-bold text-slate-700">Google Maps verilənlər bazasından məlumat dəqiqləşdirilir...</p>
            </div>
          ) : resultText ? (
            <div className="bg-slate-50/60 p-5 rounded-2xl border border-slate-100">
              {renderFormattedResult(resultText)}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400 space-y-2">
              <Map className="w-12 h-12 text-slate-300" />
              <p className="text-xs font-medium">Sorğunuz üzrə xəritə cavabları burada nümayiş etdiriləcək.</p>
            </div>
          )}
        </div>

        {/* Google Maps Grounding Place Cards */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white border border-slate-150 rounded-3xl p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <MapPin className="w-4 h-4 text-emerald-600" />
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                Google Maps Məkan Kartları ({groundingChunks.length})
              </h3>
            </div>

            {groundingChunks.length > 0 ? (
              <div className="space-y-3">
                {groundingChunks.map((chunk: any, i: number) => {
                  const mapsData = chunk.maps || chunk.web || {};
                  const title = mapsData.title || mapsData.placeName || `Məkan #${i + 1}`;
                  const uri = mapsData.uri || mapsData.url || "https://maps.google.com";
                  const snippets = mapsData.placeAnswerSources?.reviewSnippets || [];

                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 bg-emerald-50/40 border border-emerald-150 rounded-2xl space-y-2 hover:bg-emerald-50 transition-all"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>{title}</span>
                        </h4>

                        <a
                          href={uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 shrink-0 transition-all shadow-xs"
                        >
                          <span>Xəritədə bax</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>

                      {snippets.length > 0 && (
                        <div className="text-[11px] text-slate-600 bg-white/80 p-2 rounded-xl border border-emerald-100/50 space-y-1">
                          {snippets.map((snip: any, idx: number) => (
                            <p key={idx} className="line-clamp-2 italic">
                              "{snip.text || snip}"
                            </p>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="p-6 text-center text-slate-400 space-y-2 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <Compass className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-[11px] font-medium">Axtarış nəticəsində Google Maps linkləri və məkan kartları bura çıxacaq.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
