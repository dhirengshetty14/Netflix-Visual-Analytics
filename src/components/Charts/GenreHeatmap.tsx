import * as d3 from "d3";
import React, { useEffect, useMemo, useRef, useState } from "react";
import useResizeObserver from "../../lib/useResizeObserver";

type Row = { release_year: number; genres: string; count: number };

export default function GenreHeatmap({
  data,                 // NOT filtered by selectedGenres (so user can pick any)
  yearRange,
  selectedGenres,
  onToggleGenre,        // (g) => void
  onBrushYears,         // (range|null) => void  (optional; App can ignore)
}: {
  data: Row[];
  yearRange: [number, number];
  selectedGenres: string[];
  onToggleGenre: (g: string) => void;
  onBrushYears?: (range: [number, number] | null) => void;
}) {
  const { ref, size } = useResizeObserver<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement | null>(null);

  // local UI mode
  const [mode, setMode] = useState<"count" | "share">("count");

  // pivot lists
  const years = useMemo(() => {
    const ys = Array.from(new Set(data.map(d => d.release_year))).sort((a,b)=>a-b);
    return ys;
  }, [data]);

  const genres = useMemo(() => {
    const gs = Array.from(new Set(data.map(d => d.genres))).sort((a,b)=>a.localeCompare(b));
    return gs;
  }, [data]);

  // pivot matrix: genre x year -> value
  const matrix = useMemo(() => {
    // totals per year for share mode
    const totalByYear = d3.rollup(
      data,
      (v) => d3.sum(v, d => d.count),
      d => d.release_year
    );

    const byGY = d3.rollup(
      data,
      (v) => d3.sum(v, d => d.count),
      d => d.genres,
      d => d.release_year
    );

    const values: number[][] = genres.map(() => years.map(() => 0));
    genres.forEach((g, gi) => {
      years.forEach((y, yi) => {
        const c = (byGY.get(g)?.get(y)) ?? 0;
        if (mode === "count") {
          values[gi][yi] = c;
        } else {
          const tot = totalByYear.get(y) ?? 1;
          values[gi][yi] = tot ? (c / tot) : 0;
        }
      });
    });
    return { values };
  }, [data, years, genres, mode]);

  useEffect(() => {
    const { width, height } = size;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    if (width < 10 || height < 10 || genres.length === 0 || years.length === 0) return;

    const margin = { top: 26, right: 10, bottom: 42, left: 140 };
    const w = width - margin.left - margin.right;
    const h = height - margin.top - margin.bottom;

    const x = d3.scaleBand<number>().domain(years).range([0, w]).paddingInner(0.02);
    const y = d3.scaleBand<string>().domain(genres).range([0, h]).paddingInner(0.05);

    // color
    const vmax = d3.max(matrix.values.flat()) ?? 1;
    const color = mode === "count"
      ? d3.scaleSequential(d3.interpolateMagma).domain([0, vmax || 1])
      : d3.scaleSequential(d3.interpolateTurbo).domain([0, 0.25]); // cap at 25% share for contrast

    const root = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    // axes
    const gx = root.append("g").attr("transform", `translate(0,${h})`).call(
      d3.axisBottom(x).tickValues(
        years.filter((y, i) => (i % Math.ceil(years.length / 12) === 0)) // max ~12 ticks
      )
    );
    gx.selectAll("text").attr("fill", "white").attr("font-size", 11);
    gx.selectAll(".domain,.tick line").attr("stroke", "rgba(255,255,255,0.35)");

    const gy = root.append("g").call(d3.axisLeft(y));
    gy.selectAll("text")
      .attr("fill", "white")
      .attr("font-size", 11)
      .style("cursor", "pointer")
      .on("click", (_, g) => onToggleGenre(g as string));
    gy.selectAll(".domain,.tick line").attr("stroke", "rgba(255,255,255,0.35)");

    // highlight selected genres on Y labels
    gy.selectAll<HTMLTextAreaElement, string>("text").attr("font-weight", (g) => selectedGenres.includes(g) ? 700 : 400);

    // tooltip
    const tip = d3.select(ref.current)
      .append("div")
      .style("position", "absolute")
      .style("pointer-events", "none")
      .style("background", "#000a")
      .style("border", "1px solid rgba(255,255,255,0.25)")
      .style("borderRadius", "8px")
      .style("color", "#fff")
      .style("font", "12px system-ui")
      .style("padding", "6px 8px")
      .style("opacity", "0");

    // cells
    const cells: { g: string; y: number; v: number }[] = [];
    genres.forEach((g, gi) => {
      years.forEach((yr, yi) => {
        cells.push({ g, y: yr, v: matrix.values[gi][yi] });
      });
    });

    root.append("g")
      .selectAll("rect.cell")
      .data(cells)
      .join("rect")
      .attr("class", "cell")
      .attr("x", d => (x(d.y) ?? 0))
      .attr("y", d => (y(d.g) ?? 0))
      .attr("width", x.bandwidth())
      .attr("height", y.bandwidth())
      .attr("rx", 2)
      .attr("fill", d => color(d.v))
      .attr("opacity", d => selectedGenres.length === 0 || selectedGenres.includes(d.g) ? 1 : 0.25)
      .style("cursor", "pointer")
      .on("mousemove", (event, d) => {
        const [mx, my] = d3.pointer(event, svg.node() as any);
        const value = mode === "count" ? d.v.toLocaleString() : (d.v * 100).toFixed(1) + "%";
        tip.style("opacity", "1")
           .style("left", `${mx + 14}px`)
           .style("top", `${my + 14}px`)
           .html(`<b>${d.g}</b><div>${d.y}</div><div>${mode === "count" ? "Titles: " : "Share: "}${value}</div>`);
      })
      .on("mouseleave", () => tip.style("opacity", "0"))
      .on("click", (_, d) => onToggleGenre(d.g));

    // title
    svg.append("text")
      .attr("x", margin.left)
      .attr("y", 16)
      .attr("fill", "white")
      .attr("font-size", 12)
      .text(mode === "count" ? "Genre momentum — titles per year" : "Genre momentum — genre share per year");

    // brush on X (years)
    if (onBrushYears) {
      const brush = d3.brushX()
        .extent([[0, 0], [w, y.bandwidth()]]) // thin strip brush under the axis
        .on("end", (ev) => {
          if (!ev.selection) { onBrushYears(null); return; }
          const [x0, x1] = ev.selection.map((px: number) => Math.round(x.invert ? (x as any).invert(px) : years[Math.max(0, Math.min(years.length-1, Math.round(px / x.step())))]));
          // safer mapping:
          const yr0 = Math.max(years[0], Math.min(years[years.length-1], Math.round(years[0] + (x0 / (w)) * (years[years.length-1] - years[0]))));
          const yr1 = Math.max(years[0], Math.min(years[years.length-1], Math.round(years[0] + (x1 / (w)) * (years[years.length-1] - years[0]))));
          onBrushYears([Math.min(yr0, yr1), Math.max(yr0, yr1)]);
        });

      root.append("g")
        .attr("transform", `translate(0,${h + 6})`)
        .call(brush as any);
    }

    return () => {
      tip.remove();
    };
  }, [size, data, years, genres, matrix, selectedGenres, onToggleGenre, onBrushYears, mode, yearRange]);

  return (
    <div ref={ref} className="w-full h-full relative">
      {/* tiny control */}
      <div className="absolute right-2 top-2 z-10 text-xs flex items-center gap-2">
        <span className="opacity-70">Mode:</span>
        <button
          className={`px-2 py-1 rounded border ${mode==="count" ? "bg-white/10 border-white/30" : "border-white/20"}`}
          onClick={() => setMode("count")}
        >
          Count
        </button>
        <button
          className={`px-2 py-1 rounded border ${mode==="share" ? "bg-white/10 border-white/30" : "border-white/20"}`}
          onClick={() => setMode("share")}
        >
          Share %
        </button>
      </div>
      <svg ref={svgRef} className="w-full h-full" />
    </div>
  );
}
