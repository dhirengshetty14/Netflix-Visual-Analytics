import * as d3 from "d3";
import React, { useEffect, useMemo, useRef, useState } from "react";
import useResizeObserver from "../../lib/useResizeObserver";
import { feature } from "topojson-client";
import world110m from "world-atlas/countries-110m.json?json"; // vite can import json w/ ?json

type CountryRec = { release_year: number; country: string; count: number };

export default function WorldMap({
  data,              // filtered country/year rows
  yearRange,
  selectedCountry,
  onSelectCountry,   // setter to App
  animate = false,
}: {
  data: CountryRec[];
  yearRange: [number, number];
  selectedCountry: string | null;
  onSelectCountry: (c: string | null) => void;
  animate?: boolean;
}) {
  const { ref, size } = useResizeObserver<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement | null>(null);

  // countries topojson -> geojson
  const countries = useMemo(() => {
    const f = feature(world110m as any, (world110m as any).objects.countries) as any;
    return f.features as any[];
  }, []);

  // aggregate: country -> count (within yearRange)
  const totals = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of data) {
      if (r.release_year < yearRange[0] || r.release_year > yearRange[1]) continue;
      const c = r.country;
      map.set(c, (map.get(c) || 0) + r.count);
    }
    return map;
  }, [data, yearRange]);

  // for color scale
  const maxVal = useMemo(() => d3.max(totals.values()) ?? 0, [totals]);
  const color = useMemo(() => d3.scaleSequential(d3.interpolateYlOrRd).domain([0, maxVal || 1]), [maxVal]);

  // projection
  const proj = useMemo(() => d3.geoMercator(), []);
  const path = useMemo(() => d3.geoPath(proj as any), [proj]);

  // simple hover tooltip
  const [tip, setTip] = useState<{ x: number; y: number; html: string } | null>(null);

  useEffect(() => {
    const { width, height } = size;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    if (width < 10 || height < 10 || !countries.length) return;

    const margin = { top: 8, right: 8, bottom: 32, left: 8 };
    const w = width - margin.left - margin.right;
    const h = height - margin.top - margin.bottom;

    proj.fitSize([w, h], { type: "Sphere" } as any);
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    // water
    g.append("path")
      .datum({ type: "Sphere" } as any)
      .attr("d", path as any)
      .attr("fill", "#0b0b0f");

    // draw countries
    const nodes = g.append("g")
      .selectAll("path.country")
      .data(countries)
      .join("path")
      .attr("class", "country")
      .attr("d", path as any)
      .attr("fill", (d: any) => color(totals.get((d.properties?.name as string) || "") || 0))
      .attr("stroke", (d: any) => (selectedCountry === d.properties?.name ? "#ffffff" : "rgba(255,255,255,0.25)"))
      .attr("stroke-width", (d: any) => (selectedCountry === d.properties?.name ? 1.8 : 0.5))
      .on("mousemove", (event: any, d: any) => {
        const name = d.properties?.name as string;
        const val = totals.get(name) || 0;
        setTip({ x: event.offsetX + 12, y: event.offsetY + 12, html: `<b>${name}</b><div>${val.toLocaleString()} titles</div>` });
      })
      .on("mouseleave", () => setTip(null))
      .on("click", (_evt: any, d: any) => {
        const name = d.properties?.name as string;
        if (!name) return;
        onSelectCountry(selectedCountry === name ? null : name);
      });

    // legend (simple gradient bar)
    const legendW = Math.min(220, w * 0.45), legendH = 8;
    const lg = svg.append("g").attr("transform", `translate(${margin.left},${h + margin.top + 18})`);
    const gradId = "map-grad";
    const defs = svg.append("defs");
    const grad = defs.append("linearGradient").attr("id", gradId).attr("x1", "0%").attr("x2", "100%").attr("y1", "0%").attr("y2", "0%");
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      grad.append("stop").attr("offset", `${i * 10}%`).attr("stop-color", color(maxVal * t));
    }
    lg.append("rect").attr("width", legendW).attr("height", legendH).attr("fill", `url(#${gradId})`).attr("rx", 4);
    const scale = d3.scaleLinear().domain([0, maxVal]).range([0, legendW]);
    const axis = d3.axisBottom(scale).ticks(4).tickFormat(d3.format("~s") as any);
    lg.append("g").attr("transform", `translate(0,${legendH})`).call(axis).selectAll("text").attr("fill", "white");
    lg.selectAll(".domain,.tick line").attr("stroke", "rgba(255,255,255,0.4)");
    svg.append("text").attr("x", margin.left).attr("y", margin.top + 10).attr("fill", "white").attr("font-size", 12)
      .text(`Titles by country ${yearRange[0]}–${yearRange[1]}`);

    // animate years (optional)
    if (animate) {
      let y0 = yearRange[0];
      const timer = d3.interval(() => {
        y0++;
        if (y0 > yearRange[1]) y0 = yearRange[0];
        const partial = new Map<string, number>();
        for (const r of data) {
          if (r.release_year <= y0 && r.release_year >= yearRange[0]) {
            partial.set(r.country, (partial.get(r.country) || 0) + r.count);
          }
        }
        nodes.attr("fill", (d: any) => color(partial.get((d.properties?.name as string) || "") || 0));
      }, 600);
      return () => timer.stop();
    }
  }, [size, countries, totals, color, path, proj, yearRange, data, selectedCountry, animate]);

  return (
    <div ref={ref} className="w-full h-full relative">
      {tip && (
        <div
          style={{
            position: "absolute",
            left: tip.x,
            top: tip.y,
            background: "#000a",
            border: "1px solid rgba(255,255,255,0.25)",
            borderRadius: 8,
            padding: "6px 8px",
            color: "#fff",
            fontSize: 12,
            pointerEvents: "none",
          }}
          dangerouslySetInnerHTML={{ __html: tip.html }}
        />
      )}
      <svg ref={svgRef} className="w-full h-full" />
    </div>
  );
}
