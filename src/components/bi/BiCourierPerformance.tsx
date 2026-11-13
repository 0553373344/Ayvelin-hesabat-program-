import React, { useEffect, useRef, useMemo } from "react";
import * as d3 from "d3";
import { Sale } from "../../types";
import { useTheme } from "../../context/ThemeContext";

interface Props {
  sales: Sale[];
}

export default function BiCourierPerformance({ sales }: Props) {
  const d3Container = useRef<SVGSVGElement>(null);
  const { theme } = useTheme();

  // Group courier deliveries by date over the last 30 days
  const data = useMemo(() => {
    const courierSales = sales.filter(
      (s) => s.deliveryType === "courier" && s.status === "çatdırılıb"
    );

    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(now.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const dataMap: Record<string, { totalHours: number; count: number }> = {};

    courierSales.forEach((sale) => {
      const createdDate = new Date(sale.createdAt);
      if (createdDate >= thirtyDaysAgo) {
        // Find delivered time from statusHistory
        const deliveredHistory = sale.statusHistory?.find((h) => h.status === "çatdırılıb");
        const deliveredTime = deliveredHistory ? new Date(deliveredHistory.changedAt) : (sale.deliveredAt ? new Date(sale.deliveredAt) : null);
        
        if (deliveredTime && deliveredTime > createdDate) {
          const diffHour = (deliveredTime.getTime() - createdDate.getTime()) / (1000 * 60 * 60);
          
          const dateStr = createdDate.toISOString().split("T")[0]!;
          if (!dataMap[dateStr]) {
            dataMap[dateStr] = { totalHours: 0, count: 0 };
          }
          
          dataMap[dateStr].totalHours += diffHour;
          dataMap[dateStr].count += 1;
        }
      }
    });

    const output = [];
    for (let d = new Date(thirtyDaysAgo); d <= now; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split("T")[0]!;
      const stat = dataMap[dateStr];
      output.push({
        dateStr,
        date: new Date(dateStr),
        avgResponseTime: stat && stat.count > 0 ? stat.totalHours / stat.count : 0,
      });
    }

    return output;
  }, [sales]);

  useEffect(() => {
    if (!d3Container.current || data.length === 0) return;

    const svg = d3.select(d3Container.current);
    svg.selectAll("*").remove(); // Clear previous render

    const wrapper = d3Container.current.parentElement;
    const width = wrapper ? wrapper.clientWidth : 800;
    const height = 400;
    const margin = { top: 20, right: 30, bottom: 45, left: 50 };

    svg.attr("width", width).attr("height", height);

    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleTime()
      .domain(d3.extent(data, (d: any) => d.date) as [Date, Date])
      .range([0, innerWidth]);

    const maxTime = Number(d3.max(data, (d: any) => d.avgResponseTime)) || 1;
    const y = d3.scaleLinear()
      .domain([0, maxTime * 1.2]) // Add 20% headroom
      .range([innerHeight, 0]);

    // Define colors according to theme
    const axisTextColor = theme === "dark" ? "#94a3b8" : "#64748b";
    const gridColor = theme === "dark" ? "#2d3548" : "#e2e8f0";
    const crosshairColor = theme === "dark" ? "#4f5b73" : "#cbd5e1";

    // X axis
    g.append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).ticks(d3.timeDay.every(3)).tickFormat(d3.timeFormat("%b %d") as any))
      .selectAll("text")
      .style("text-anchor", "end")
      .attr("dx", "-.8em")
      .attr("dy", ".15em")
      .attr("transform", "rotate(-45)")
      .style("fill", axisTextColor)
      .style("font-family", "Inter, sans-serif")
      .style("font-size", "11px");

    // Y axis
    g.append("g")
      .call(d3.axisLeft(y).ticks(5).tickFormat(d => `${d}h`))
      .selectAll("text")
      .style("fill", axisTextColor)
      .style("font-family", "Inter, sans-serif")
      .style("font-size", "11px");

    // Gridlines
    const yAxisGrid = d3.axisLeft(y).tickSize(-innerWidth).tickFormat(() => "").ticks(5);
    g.append("g")
      .attr("class", "grid")
      .call(yAxisGrid)
      .style("stroke-dasharray", "3 3")
      .style("stroke-opacity", 0.15)
      .selectAll("line")
      .style("stroke", gridColor);

    // Line generator
    const lineGenerator = d3.line<{ date: Date; avgResponseTime: number }>()
      .x(d => x(d.date))
      .y(d => y(d.avgResponseTime))
      .curve(d3.curveMonotoneX);

    // Add Area under the line
    const areaGenerator = d3.area<{ date: Date; avgResponseTime: number }>()
      .x(d => x(d.date))
      .y0(innerHeight)
      .y1(d => y(d.avgResponseTime))
      .curve(d3.curveMonotoneX);

    const gradient = svg.append("defs")
      .append("linearGradient")
      .attr("id", "areaGradient")
      .attr("x1", "0%")
      .attr("y1", "0%")
      .attr("x2", "0%")
      .attr("y2", "100%");
      
    gradient.append("stop")
      .attr("offset", "0%")
      .attr("stop-color", "rgb(99, 102, 241)")
      .attr("stop-opacity", theme === "dark" ? 0.35 : 0.45);

    gradient.append("stop")
      .attr("offset", "100%")
      .attr("stop-color", "rgb(99, 102, 241)")
      .attr("stop-opacity", 0);

    g.append("path")
      .datum(data)
      .attr("fill", "url(#areaGradient)")
      .attr("d", areaGenerator);

    // Draw Line
    const path = g.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#4f46e5")
      .attr("stroke-width", 3)
      .attr("d", lineGenerator);

    // Animate line
    const totalLength = (path.node() as SVGPathElement).getTotalLength();
    path
      .attr("stroke-dasharray", totalLength + " " + totalLength)
      .attr("stroke-dashoffset", totalLength)
      .transition()
      .duration(1500)
      .attr("stroke-dashoffset", 0);

    // Interactive Hover elements
    const hoverGroup = g.append("g")
      .attr("class", "hover-group")
      .style("pointer-events", "none");

    const crosshairX = hoverGroup.append("line")
      .attr("class", "crosshair-line")
      .attr("stroke", crosshairColor)
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "4 4")
      .style("opacity", 0);

    const crosshairY = hoverGroup.append("line")
      .attr("class", "crosshair-line")
      .attr("stroke", crosshairColor)
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "4 4")
      .style("opacity", 0);

    const pulseRing = hoverGroup.append("circle")
      .attr("class", "pulse-ring")
      .attr("fill", "none")
      .attr("stroke", "#6366f1")
      .attr("stroke-width", 2)
      .style("opacity", 0);

    // Get or Create Neumorphic Tooltip
    let tooltip = d3.select(d3Container.current.parentElement).select(".d3-neumorphic-tooltip");
    if (tooltip.empty()) {
      tooltip = d3.select(d3Container.current.parentElement)
        .append("div")
        .attr("class", `d3-neumorphic-tooltip ${theme}`);
    } else {
      tooltip.attr("class", `d3-neumorphic-tooltip ${theme}`);
    }

    // Add dots with refined hover triggers
    g.selectAll(".dot")
      .data(data)
      .enter()
      .append("circle")
      .attr("class", "dot")
      .attr("cx", (d: any) => x(d.date))
      .attr("cy", (d: any) => y(d.avgResponseTime))
      .attr("r", 4)
      .style("fill", theme === "dark" ? "#1e232e" : "white")
      .style("stroke", "#4f46e5")
      .style("stroke-width", 2)
      .style("cursor", "crosshair")
      .on("mouseover", (event, d: any) => {
        // Animate hovered point
        d3.select(event.currentTarget)
          .transition()
          .duration(200)
          .attr("r", 7)
          .style("fill", "#6366f1")
          .style("stroke-width", 3);

        // Position & Animate crosshair guidelines
        crosshairX
          .attr("x1", x(d.date))
          .attr("x2", x(d.date))
          .attr("y1", innerHeight)
          .attr("y2", y(d.avgResponseTime))
          .style("opacity", 0.8);

        // Limit the crosshair guideline to start at left margin
        crosshairY
          .attr("x1", 0)
          .attr("x2", x(d.date))
          .attr("y1", y(d.avgResponseTime))
          .attr("y2", y(d.avgResponseTime))
          .style("opacity", 0.8);

        // Trigger pulse ring animation
        pulseRing
          .attr("cx", x(d.date))
          .attr("cy", y(d.avgResponseTime))
          .style("opacity", 1)
          .attr("r", 8)
          .transition()
          .ease(d3.easeQuadOut)
          .duration(700)
          .attr("r", 20)
          .style("opacity", 0);

        // Render elegant, custom content for Neumorphic Tooltip
        tooltip.html(`
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}; padding-bottom: 6px;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span class="pulse-indicator" style="width: 8px; height: 8px; border-radius: 50%; display: inline-block;"></span>
                <span style="font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: ${theme === 'dark' ? '#94a3b8' : '#64748b'};">
                  ${d3.timeFormat("%d %b, %Y")(d.date)}
                </span>
              </div>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <span style="font-size: 10px; font-weight: 500; color: ${theme === 'dark' ? '#64748b' : '#94a3b8'};">Ortalama Cavab Müddəti</span>
              <div style="display: flex; align-items: baseline; gap: 4px;">
                <span style="font-size: 22px; font-weight: 800; color: ${theme === 'dark' ? '#f8fafc' : '#0f172a'}; font-family: 'JetBrains Mono', monospace; line-height: 1;">
                  ${d.avgResponseTime.toFixed(1)}
                </span>
                <span style="font-size: 12px; font-weight: 700; color: #6366f1;">saat</span>
              </div>
            </div>
            
            <div style="font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.02em; color: #818cf8; background: ${theme === 'dark' ? 'rgba(99,102,241,0.12)' : 'rgba(99,102,241,0.06)'}; padding: 3px 6px; border-radius: 6px; text-align: center;">
              ⚡ Performans Göstəricisi
            </div>
          </div>
        `);

        tooltip
          .style("opacity", 1)
          .style("transform", "scale(1) translateY(0)");
      })
      .on("mousemove", (event) => {
        // Track the mouse move seamlessly
        // We calculate positioning relative to the container for maximum responsiveness
        tooltip
          .style("left", (event.pageX + 18) + "px")
          .style("top", (event.pageY - 68) + "px");
      })
      .on("mouseout", (event) => {
        // Reset point style
        d3.select(event.currentTarget)
          .transition()
          .duration(200)
          .attr("r", 4)
          .style("fill", theme === "dark" ? "#1e232e" : "white")
          .style("stroke-width", 2);

        // Hide guidelines & pulse ring
        crosshairX.style("opacity", 0);
        crosshairY.style("opacity", 0);
        pulseRing.style("opacity", 0);

        // Smoothly fade out tooltip with shrinking bounce scale
        tooltip
          .style("opacity", 0)
          .style("transform", "scale(0.95) translateY(8px)");
      });

    // Cleanup tooltip on unmount
    return () => {
      d3.select(d3Container.current?.parentElement || null).selectAll(".d3-neumorphic-tooltip").remove();
    };
  }, [data, theme]);

  return (
    <div className="bg-white dark:bg-[#1E232E] neumorphic-card rounded-2xl border border-slate-100 dark:border-slate-800 p-6 shadow-sm transition-all duration-300">
      <style>{`
        /* Neumorphic tooltips with animations */
        .d3-neumorphic-tooltip {
          position: absolute;
          pointer-events: none;
          opacity: 0;
          transform: scale(0.95) translateY(8px);
          transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          padding: 14px 16px;
          border-radius: 16px;
          font-family: 'Inter', sans-serif;
          z-index: 100;
          min-width: 195px;
        }
        .d3-neumorphic-tooltip.light {
          background: #f0f4f8;
          color: #1e293b;
          box-shadow: 6px 6px 14px #cbd5e1, -6px -6px 14px #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.8);
        }
        .d3-neumorphic-tooltip.dark {
          background: #1e232e;
          color: #e2e8f0;
          box-shadow: 6px 6px 14px #0f121a, -5px -5px 12px #2d3444;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }
        @keyframes pulseGlow {
          0% { transform: scale(0.9); opacity: 0.6; }
          50% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(0.9); opacity: 0.6; }
        }
        .pulse-indicator {
          background-color: #6366f1;
          box-shadow: 0 0 6px #6366f1;
          animation: pulseGlow 1.8s infinite ease-in-out;
        }
      `}</style>

      <div className="mb-6">
        <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 transition-colors">Kuryer Çatdırılma Performansı (D3)</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium pb-2 border-b border-slate-50/10 dark:border-slate-800/50 transition-colors">
          Son 30 gün üzrə ortalama cavab müddəti (Sifariş saatı və Çatdırılma saatı arasındakı vaxt)
        </p>
      </div>
      <div className="relative w-full overflow-x-auto">
        <div style={{ minWidth: "600px", position: "relative" }}>
          <svg ref={d3Container} style={{ width: "100%", display: "block" }} />
        </div>
      </div>
    </div>
  );
}
