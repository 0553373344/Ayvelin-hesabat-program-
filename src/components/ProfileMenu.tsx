import React, { useState } from "react";
import { 
  User as UserIcon, 
  LogOut, 
  ChevronDown, 
  Copy, 
  Check, 
  Shield, 
  Mail, 
  Settings as SettingsIcon,
  HelpCircle,
  Lock
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useData } from "../context/DataContext";
import { auth, googleProvider, signInWithPopup, signOut } from "../firebase";

interface ProfileMenuProps {
  onNavigate?: (tabId: string) => void;
}

export default function ProfileMenu({ onNavigate }: ProfileMenuProps) {
  const { currentUser, addToast } = useData();
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Helper to get initials if user photo is not available
  const getInitials = () => {
    if (!currentUser) return "U";
    if (currentUser.displayName) {
      const parts = currentUser.displayName.split(" ");
      return parts.map(p => p[0]).join("").substring(0, 2).toUpperCase();
    }
    return currentUser.email ? currentUser.email[0].toUpperCase() : "U";
  };

  // Google Login popup
  const handleSignIn = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user) {
        addToast({
          type: "success",
          title: "Sistemə Giriş",
          content: `${result.user.displayName || result.user.email || "İstifadəçi"} olaraq uğurla giriş etdiniz!`
        });
      }
    } catch (error: any) {
      if (error?.code !== "auth/popup-closed-by-user" && !error?.message?.includes("popup-closed-by-user")) {
        addToast({
          type: "warning",
          title: "Giriş Xətası",
          content: "Sistemə daxil olmaq mümkün olmadı. Yenidən cəhd edin."
        });
      }
    }
  };

  // Log out
  const handleSignOut = async () => {
    try {
      const email = currentUser?.email || "İstifadəçi";
      await signOut(auth);
      setIsOpen(false);
      addToast({
        type: "info",
        title: "Sistemdən Çıxış",
        content: `${email} hesabından uğurla çıxış edildi.`
      });
    } catch (error) {
      addToast({
        type: "warning",
        title: "Çıxış Xətası",
        content: "Sistemdən çıxış edilərkən xəta baş verdi."
      });
    }
  };

  // Copy User UID
  const handleCopyUid = () => {
    if (!currentUser) return;
    navigator.clipboard.writeText(currentUser.uid);
    setCopied(true);
    addToast({
      type: "success",
      title: "Kopyalandı",
      content: "İstifadəçi ID-si müvəffəqiyyətlə kopyalandı."
    });
    setTimeout(() => setCopied(false), 2000);
  };

  // Determine user role badge dynamically
  const getUserRole = () => {
    if (!currentUser) return "";
    const adminEmails = ["7611313@gmail.com"]; // User Email from metadata added as admin
    if (adminEmails.includes(currentUser.email || "")) {
      return "Sistem Admini";
    }
    return "Məsul İdarəçi";
  };

  if (!currentUser) {
    return (
      <button
        id="profile_sign_in_btn"
        onClick={handleSignIn}
        className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-[#1e3a5f] hover:bg-[#152943] transition-all rounded-xl border border-[#1e3a5f]/20 shadow-md select-none"
      >
        <UserIcon className="w-3.5 h-3.5" />
        <span>Giriş Et</span>
      </button>
    );
  }

  return (
    <div className="relative select-none" id="profile_menu_container">
      {/* Target Button */}
      <button
        id="profile_menu_trigger"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2.5 p-1.5 pl-3 rounded-xl bg-white/50 hover:bg-white/70 active:bg-white/80 border border-white/30 backdrop-blur-md transition-all cursor-pointer shadow-xs focus:outline-none"
      >
        <div className="flex flex-col text-left hidden sm:flex">
          <span className="text-[11px] font-extrabold text-slate-805 leading-none">
            {currentUser.displayName || (currentUser.isAnonymous ? "Qonaq İdarəçi" : "İstifadəçi")}
          </span>
          <span className="text-[9px] text-slate-500 font-medium font-mono leading-none mt-0.5">
            {currentUser.isAnonymous ? "Online Baza" : getUserRole()}
          </span>
        </div>

        {currentUser.photoURL ? (
          <img
            id="profile_avatar_img"
            src={currentUser.photoURL}
            alt="Profile Avatar"
            referrerPolicy="no-referrer"
            className="w-8 h-8 rounded-lg object-cover shadow-sm ring-1 ring-slate-200/50"
          />
        ) : (
          <div 
            id="profile_avatar_fallback"
            className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#1e3a5f] to-indigo-650 flex items-center justify-center font-bold text-[11px] text-white shadow-sm"
          >
            {getInitials()}
          </div>
        )}

        <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {/* Invisible Overlay for click-outside closure */}
      {isOpen && (
        <div 
          id="profile_menu_overlay"
          className="fixed inset-0 z-40 cursor-default" 
          onClick={() => setIsOpen(false)} 
        />
      )}

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            id="profile_dropdown_card"
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute right-0 mt-2 w-72 bg-white/95 backdrop-blur-lg rounded-2xl shadow-2xl border border-slate-100/80 p-4 z-50 overflow-hidden font-sans"
          >
            {/* Header / Info Section */}
            <div className="flex items-center gap-3.5 pb-4 border-b border-slate-100" id="profile_dropdown_user_header">
              {currentUser.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt="Avatar"
                  referrerPolicy="no-referrer"
                  className="w-12 h-12 rounded-xl object-cover shadow-md ring-2 ring-white"
                />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-[#1e3a5f] to-indigo-650 flex items-center justify-center font-black text-sm text-white shadow-md">
                  {getInitials()}
                </div>
              )}

              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-bold text-slate-900 truncate">
                  {currentUser.displayName || (currentUser.isAnonymous ? "Qonaq İdarəçi" : "İstifadəçi")}
                </h4>
                <p className="text-[10px] text-slate-500 font-medium flex items-center gap-1 mt-0.5 truncate">
                  <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="truncate">{currentUser.email || (currentUser.isAnonymous ? "Anonim Sessiya (Online)" : "E-poçt yoxdur")}</span>
                </p>
                <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-[8.5px] font-bold bg-[#1e3a5f]/10 text-[#1e3a5f] border border-[#1e3a5f]/5">
                  <Shield className="w-2.5 h-2.5" />
                  {currentUser.isAnonymous ? "Qonaq Rejim" : getUserRole()}
                </span>
              </div>
            </div>

            {/* Google Sign in / Registration if Anonymous */}
            {currentUser.isAnonymous && (
              <div className="py-2.5 border-b border-slate-100" id="profile_google_connect_section">
                <button
                  id="profile_google_signin_btn"
                  onClick={handleSignIn}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-[#1A1F2E] text-white hover:bg-indigo-900 font-semibold text-xs shadow-xs cursor-pointer transition-all"
                >
                  <UserIcon className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Google ilə Giriş / Qeydiyyat</span>
                </button>
                <p className="text-[9.5px] text-slate-400 text-center mt-1">
                  Şəxsi Google hesabınızla daimi giriş edin
                </p>
              </div>
            )}

            {/* Profile State Stats */}
            <div className="py-3.5 space-y-2 border-b border-slate-100" id="profile_dropdown_details">
              <div className="flex items-center justify-between text-[10px] text-slate-600 font-medium">
                <span className="flex items-center gap-1 text-slate-500">
                  <Lock className="w-3 h-3 text-slate-400" />
                  Baza Əlaqəsi
                </span>
                <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md font-bold text-[9px] border border-emerald-200/60 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Canlı Online
                </span>
              </div>

              {/* UID Field with copy */}
              <div className="flex items-center justify-between text-[10px] text-slate-600 font-medium">
                <span className="text-slate-500">ID nömrəsi</span>
                <button
                  onClick={handleCopyUid}
                  className="group flex items-center gap-1 font-mono text-slate-500 hover:text-[#1e3a5f] p-1 -m-1 rounded-md transition-colors"
                  title="UID-ni kopyala"
                >
                  <span className="truncate max-w-[120px]">{currentUser.uid.substring(0, 10)}...</span>
                  {copied ? (
                    <Check className="w-3 h-3 text-emerald-500" />
                  ) : (
                    <Copy className="w-3 h-3 opacity-60 group-hover:opacity-100 transition-opacity" />
                  )}
                </button>
              </div>
            </div>

            {/* Navigation links & Actions */}
            <div className="py-2 space-y-0.5" id="profile_dropdown_shortcuts">
              {onNavigate && (
                <>
                  <button
                    onClick={() => {
                      onNavigate("manager");
                      setIsOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs text-slate-700 hover:text-[#1e3a5f] hover:bg-slate-50 transition-colors text-left"
                  >
                    <SettingsIcon className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-semibold">Mənim Ayarlarım</span>
                  </button>

                  <button
                    onClick={() => {
                      onNavigate("settings");
                      setIsOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs text-slate-700 hover:text-[#1e3a5f] hover:bg-slate-50 transition-colors text-left"
                  >
                    <Shield className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-semibold">İstifadəçi Səlahiyyətləri</span>
                  </button>
                </>
              )}

              <a
                href="https://google.com"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs text-slate-700 hover:text-[#1e3a5f] hover:bg-slate-50 transition-colors text-left"
              >
                <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-semibold">Dəstək və Kömək</span>
              </a>
            </div>

            {/* Sign out section */}
            <div className="pt-2 border-t border-slate-100" id="profile_dropdown_logout_sec">
              <button
                id="profile_sign_out_btn"
                onClick={handleSignOut}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-red-50 hover:bg-red-100 active:bg-red-150 text-red-650 hover:text-red-750 font-bold text-xs rounded-xl transition-all shadow-xs border border-red-100"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Hesabdan Çıx</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
