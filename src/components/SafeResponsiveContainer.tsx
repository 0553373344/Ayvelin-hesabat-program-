import React, { useState, useEffect } from "react";
import { ResponsiveContainer } from "recharts";

interface SafeResponsiveContainerProps {
  children: React.ReactElement;
  width?: string | number;
  height?: string | number;
  aspect?: number;
  debounce?: number;
  id?: string | number;
  className?: string;
}

export default function SafeResponsiveContainer({ 
  children, 
  width = "100%", 
  height = "100%", 
  ...props 
}: SafeResponsiveContainerProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Fast frame-sync allows the layout engine to compute parent dimensions with 0 perceived delay
    const handle = requestAnimationFrame(() => {
      setMounted(true);
    });
    return () => cancelAnimationFrame(handle);
  }, []);

  if (!mounted) {
    return (
      <div className="w-full h-full min-h-[150px] flex items-center justify-center text-[10px] text-slate-400 font-sans italic bg-slate-50/10 rounded-xl">
        Grafik hazırlanır...
      </div>
    );
  }

  return (
    <ResponsiveContainer 
      width={width} 
      height={height} 
      minWidth={0} 
      minHeight={0} 
      {...props}
    >
      {children}
    </ResponsiveContainer>
  );
}
