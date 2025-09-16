import * as d3 from "d3";
import React, { useEffect, useMemo, useRef, useState } from "react";
import useResizeObserver from "../../lib/useResizeObserver";

type Row = {
  title: string;
  type: "Movie" | "TV Show";
  release_year: number;
  added_year: number;
  age_years: number;           // added_year - release_year  (clamped to >=0)
  primary_genre: string | null;
  rating_group: "Kids" | "Teen" | "Adult" | "Other";
};

type Bucket =
  | { key: "0–1y";  lo: number; hi: number }
  | { key: "2–4y";  lo: number; hi: number }
  | { key: "5–9y";  lo: number; hi: number }
  | { key: "10–19y";lo: number; hi: number }
  | { key: "20y+";  lo: number; hi: number };

const BUCKETS: Bucket[] = [
  { key: "0–1y",   lo: 0,  hi: 1 },
  { key: "2–4y",   lo: 2,  hi: 4 },
  { key: "5–9y",   lo: 5,  hi: 9 },
  { key: "10–19y", lo: 10, hi: 19 },
  { key: "20y+",   lo: 20, hi: 200 },
];

// colorful but classy
const GENRE_PALETTE = d3.schemeTableau10;

export default function RadialAgeClock({
  data,
  yearRange,
  typeFilter,
  selectedGenres,
  onToggleGenre,
  selectedBucket,
  onSelectBucket,
}: {
  data: Row[] | null;                               // null if file missing
  yearRange: [number, number];
  typeFilter: "All" | "Movie" | "TV Show";
  selectedGenres: string[];
  onToggleGenre: (g: string) => void;
  selectedBucket: string | null;                    // e.g. "5–9y"
  onSelectBucket: (b: string | null) => void;
}) {
  const { ref, size } = useResizeObserver<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [mode, setMode] = useState<"count" | "share">("count");

  // -------- guard --------
  const raw = data ?? [];
  const hasData = raw.length > 0;

  // -------- filter & pivot --------
  const filtered = useMemo(() => {
    const yearOk = (r: Row) => r.release_year >= yearRange[0] && r.release_year <= yearRange[1];
    const typeOk = (r: Row) => typeFilter === "All" || r.type === typeFilter;
    const genreOk = (r: Row) => selectedGenres.length === 0 || (r.primary_genre && selectedGenres.includes(r.primary_genre));
    const bucketOk = (r: Row) => {
      if (!selectedBucket) return true;
      const b = BUCKETS.find(b => b.key === selectedBucket)!;
      return r.age_years >= b.lo && r.age_years <= b.hi;
    };
    return raw.filter(r => r.age_years >= 0 && yearOk(r) && typeOk(r) && genreOk(r) && bucketOk(r));
  }, [raw, yearRange, typeFilter, selectedGenres, selectedBucket]);

  // genre list (limited to top 10 for clarity)
  const topGenres = useMemo(() => {
    const byG = d3.rollup(filtered, v => v.length, r => r.primary_genre ?? "Other");
    return Array.from(byG.entries())
      .sort((a,b) => d3.descending(a[1], b[1]))
      .slice(0, 10)
      .map(d => d[0]);
  }, [filtered]);

  // pivot to ring sections: bucket × genre -> count
  const series = useMemo(() => {
    const base = BUCKETS.map(b => ({
      bucket: b.key,
      values: topGenres.map(g => ({ genre: g, count: 0 })),
      total: 0
    }));
    const idxG = new Map(topGenres.map((g,i) => [g,i]));
    for (const r of filtered) {
      const b = BUCKETS.find(b => r.age_years >= b.lo && r.age_years <= b.hi)!;
      const row = base.find(x => x.bucket === b.key)!;
      const gi = idxG.get(r.primary_genre ?? "Other");
      if (gi != null) {
        row.values[gi].count++;
        row.total++;
      }
    }
    return base;
  }, [filtered, topGenres]);

  const totalsAll = useMemo(() => series.reduce((a,s)=>a+s.total,0), [series]);

  // -------- draw --------
  useEffect(() => {
    const { width, height } = size;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    if (!hasData || width < 10 || height < 10 || topGenres.length === 0) {
      // no data state
      svg.append("text")
        .attr("x", width/2)
        .attr("y", height/2)
        .attr("fill", "white")
        .attr("text-anchor", "middle")
        .attr("font-size", 14)
        .style("opacity", 0.7)
        .text("No content-age data");
      return;
    }

    const cx = width / 2;
    const cy = height / 2 + 6;
    const outerR = Math.min(width, height) / 2 - 18;

    const innerRings = d3.scaleBand<string>()
      .domain(BUCKETS.map(b => b.key))
      .range([outerR * 0.25, outerR])
      .paddingInner(0.11);

    const angle = d3.scaleBand<string>()
      .domain(topGenres)
      .range([0, Math.PI * 2])
      .paddingInner(0.03);

    const color = d3.scaleOrdinal<string, string>()
      .domain(topGenres)
      .range(GENRE_PALETTE as any);

    const root = svg.append("g").attr("transform", `translate(${cx},${cy})`);

    // rings (background clickable bands)
    root.append("g")
      .selectAll("circle")
      .data(BUCKETS)
      .join("circle")
      .attr("r", b => (innerRings(b.key) ?? 0) + innerRings.bandwidth()/2)
      .attr("fill", (_, i) => i % 2 === 0 ? "#0f0f14" : "#111117")
      .attr("stroke", (b) => (selectedBucket === b.key ? "#fff" : "rgba(255,255,255,0.15)"))
      .attr("stroke-width", (b) => (selectedBucket === b.key ? 2.0 : 0.8))
      .style("cursor","pointer")
      .on("click", (_, b) => {
        onSelectBucket(selectedBucket === b.key ? null : b.key);
      });

    // wedges
    const arc = d3.arc<{bucket:string; genre:string; v:number}>()
      .innerRadius(d => (innerRings(d.bucket) ?? 0))
      .outerRadius(d => (innerRings(d.bucket) ?? 0) + innerRings.bandwidth())
      .startAngle(d => (angle(d.genre) ?? 0))
      .endAngle(d => (angle(d.genre) ?? 0) + angle.bandwidth())
      .cornerRadius(3);

    // flatten data for wedges
    const cells: {bucket:string; genre:string; v:number; share:number}[] = [];
    for (const s of series) {
      for (const it of s.values) {
        const v = it.count;
        const share = s.total ? v / s.total : 0;
        cells.push({ bucket: s.bucket, genre: it.genre, v, share });
      }
    }

    const maxV = d3.max(cells, d => mode === "count" ? d.v : d.share) ?? 1;
    const alpha = d3.scaleLinear().domain([0, maxV || 1]).range([0.05, 1]);

    const tip = d3.select(ref.current)
      .append("div")
      .style("position","absolute")
      .style("pointer-events","none")
      .style("background","#000a")
      .style("border","1px solid rgba(255,255,255,0.25)")
      .style("borderRadius","8px")
      .style("color","#fff")
      .style("font","12px system-ui")
      .style("padding","6px 8px")
      .style("opacity","0");

    root.append("g")
      .selectAll("path.wedge")
      .data(cells)
      .join("path")
      .attr("class","wedge")
      .attr("d", arc as any)
      .attr("fill", d => {
        const base = color(d.genre);
        const a = alpha(mode === "count" ? d.v : d.share);
        return d3.color(base)!.copy({ opacity: a })!.formatRgb();
      })
      .attr("stroke", "rgba(255,255,255,0.12)")
      .on("mousemove", (ev, d) => {
        const value = mode === "count" ? d.v.toLocaleString() : (d.share*100).toFixed(1) + "%";
        tip.style("opacity","1")
           .style("left", `${ev.offsetX + 14}px`)
           .style("top", `${ev.offsetY + 14}px`)
           .html(`<b>${d.genre}</b> • ${d.bucket}<div>${mode==="count"?"Titles: ":"Share: "}${value}</div>`);
      })
      .on("mouseleave", () => tip.style("opacity","0"))
      .style("cursor","pointer")
      .on("click", (_, d) => onToggleGenre(d.genre));

    // radial separators
    root.append("g")
      .selectAll("line.sep")
      .data(topGenres)
      .join("line")
      .attr("class","sep")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", g => Math.cos((angle(g) ?? 0)) * (outerR + 2))
      .attr("y2", g => Math.sin((angle(g) ?? 0)) * (outerR + 2))
      .attr("stroke","rgba(255,255,255,0.12)")
      .attr("stroke-width",0.6);

    // genre labels around circle (clickable)
    root.append("g")
      .selectAll("text.glab")
      .data(topGenres)
      .join("text")
      .attr("class","glab")
      .attr("x", g => Math.cos((angle(g) ?? 0) + angle.bandwidth()/2) * (outerR + 14))
      .attr("y", g => Math.sin((angle(g) ?? 0) + angle.bandwidth()/2) * (outerR + 14))
      .attr("text-anchor", g => {
        const a = (angle(g) ?? 0) + angle.bandwidth()/2;
        return Math.cos(a) > 0 ? "start" : "end";
      })
      .attr("dominant-baseline","middle")
      .attr("fill","white")
      .attr("font-size", 11)
      .style("cursor","pointer")
      .text(g => g)
      .on("click", (_, g) => onToggleGenre(g as string))
      .attr("font-weight", g => selectedGenres.includes(g) ? 700 : 400);

    // center label
    root.append("text")
      .attr("text-anchor","middle")
      .attr("fill","white")
      .attr("y",-4)
      .attr("font-size", 13)
      .text("Time to Netflix");

    root.append("text")
      .attr("text-anchor","middle")
      .attr("fill","rgba(255,255,255,0.7)")
      .attr("y", 14)
      .attr("font-size", 11)
      .text(`${totalsAll.toLocaleString()} titles  •  ${typeFilter === "All" ? "All types" : typeFilter}`);

    return () => { tip.remove(); };
  }, [size, hasData, filtered, series, selectedBucket, onSelectBucket, selectedGenres, topGenres, mode, yearRange, typeFilter]);

  return (
    <div ref={ref} className="w-full h-full relative">
      {/* control chip */}
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
