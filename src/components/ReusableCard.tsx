import React from "react";
import { useNavigate } from "react-router-dom";
import { LucideIcon } from "lucide-react";
import { motion } from "motion/react";

interface ReusableCardProps {
  title: string;
  description?: string;
  icon: LucideIcon;
  route: string;
  colorClass?: string;
  badge?: string;
}

export default function ReusableCard({ 
  title, 
  description, 
  icon: Icon, 
  route, 
  colorClass = "text-indigo-600 bg-indigo-50",
  badge
}: ReusableCardProps) {
  const navigate = useNavigate();

  return (
    <div 
      onClick={() => navigate(route)} 
      className="block select-none cursor-pointer group h-full"
    >
      <motion.div
        whileHover={{ 
          scale: 1.03,
          boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)"
        }}
        whileTap={{ scale: 0.97 }}
        transition={{ duration: 0.25, ease: "easeInOut" }}
        className="h-full bg-white/90 backdrop-blur-md p-6 rounded-2xl border border-slate-100 hover:border-[#006bf8]/30 shadow-sm flex flex-col justify-between"
      >
        <div className="flex justify-between items-start gap-4">
          <div className="space-y-1.5 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-extrabold text-slate-800 tracking-tight group-hover:text-slate-900 transition-colors">
                {title}
              </h4>
              {badge && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#006bf8]/10 text-[#006bf8] animate-pulse">
                  {badge}
                </span>
              )}
            </div>
            {description && (
              <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
                {description}
              </p>
            )}
          </div>
          <div className={`p-3 rounded-xl shrink-0 transition-all duration-300 group-hover:rotate-6 ${colorClass}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
        
        <div className="mt-5 flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          <span className="group-hover:text-slate-600 transition-colors">Modula keç</span>
          <span className="text-slate-300 group-hover:translate-x-1.5 transition-transform inline-block">→</span>
        </div>
      </motion.div>
    </div>
  );
}
