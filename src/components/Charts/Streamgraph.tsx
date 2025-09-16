import * as d3 from "d3";
import React, { useEffect, useMemo, useRef } from "react";
import useResizeObserver from "../../lib/useResizeObserver";

type Rec = { release_year: number; genres: string; count: number; };

export default function Streamgraph({
  data,
  yearRange,
}: {
  data: Rec[];
  yearRange: [number, number];
}) {
  const { ref, size } = useResizeObserver<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement|null>(null);

  const years = useMemo(() => {
    const s = new Set<number>();
    data.forEach(d => { if (d.release_year>=yearRange[0] && d.release_year<=yearRange[1]) s.add(d.release_year); });
    return Array.from(s).sort((a,b)=>a-b);
  }, [data, yearRange]);

  const series = useMemo(() => {
    const genres = Array.from(new Set(data.map(d => d.genres))).sort();
    const byYear = new Map<number, Map<string, number>>();
    years.forEach(y => byYear.set(y, new Map()));
    data.forEach(d => {
      if (d.release_year<yearRange[0] || d.release_year>yearRange[1]) return;
      const row = byYear.get(d.release_year)!;
      row.set(d.genres, (row.get(d.genres) || 0) + d.count);
    });
    const table = years.map(y => {
      const row = byYear.get(y)!;
      const obj: any = { year: y };
      genres.forEach(g => obj[g] = row.get(g) || 0);
      return obj;
    });
    const stack = d3.stack().keys(genres).order(d3.stackOrderInsideOut).offset(d3.stackOffsetWiggle);
    return { series: stack(table as any), genres };
  }, [data, years, yearRange]);

  useEffect(() => {
    const { width, height } = size;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    if (width < 10 || height < 10 || years.length === 0) return;

    const margin = { top: 10, right: 10, bottom: 24, left: 40 };
    const w = width - margin.left - margin.right;
    const h = height - margin.top - margin.bottom;

    const x = d3.scalePoint<number>().domain(years).range([0, w]);
    const y = d3.scaleLinear()
      .domain([
        d3.min(series.series, s => d3.min(s, d => d[0])) || 0,
        d3.max(series.series, s => d3.max(s, d => d[1])) || 1
      ])
      .nice()
      .range([h, 0]);

    const color = d3.scaleOrdinal<string, string>()
      .domain(series.genres)
      .range(d3.schemeTableau10.concat(d3.schemeSet2 as any).slice(0, series.genres.length));

    const area = d3.area<any>()
      .x((d, i) => x((d.data as any).year)!)
      .y0(d => y(d[0]))
      .y1(d => y(d[1]))
      .curve(d3.curveCatmullRom.alpha(0.5));

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    g.append("g").selectAll("path")
      .data(series.series)
      .join("path")
      .attr("fill", d => color((d as any).key))
      .attr("opacity", 0.9)
      .attr("d", area as any);

    const xAxis = d3.axisBottom(x).tickValues(x.domain().filter((_, i) => i % Math.ceil(years.length / 8) === 0));
    const yAxis = d3.axisLeft(y).ticks(5);
    g.append("g").attr("transform", `translate(0,${h})`).call(xAxis).selectAll("text").attr("fill","white");
    g.append("g").call(yAxis).selectAll("text").attr("fill","white");
    g.selectAll(".domain, .tick line").attr("stroke", "rgba(255,255,255,0.4)");

    // hover
    const tooltip = d3.select(ref.current)
      .append("div")
      .style("position","absolute")
      .style("pointer-events","none")
      .style("background","#000a")
      .style("padding","6px 8px")
      .style("border","1px solid rgba(255,255,255,0.2)")
      .style("borderRadius","8px")
      .style("color","#fff")
      .style("font","12px system-ui")
      .style("opacity","0");

    g.selectAll("path")
      .on("mousemove", function (event, d: any) {
        const [mx, my] = d3.pointer(event);
        d3.selectAll("path").attr("opacity", 0.25);
        d3.select(this).attr("opacity", 1);
        tooltip
          .style("left", `${mx + margin.left + 14}px`)
          .style("top", `${my + margin.top + 14}px`)
          .style("opacity","1")
          .html(`<div style="font-weight:600">${d.key}</div>`);
      })
      .on("mouseleave", function () {
        d3.selectAll("path").attr("opacity", 0.9);
        tooltip.style("opacity","0");
      });
  }, [size, series, years, ref]);

  return (
    <div ref={ref} className="w-full h-full relative">
      <svg ref={svgRef} className="w-full h-full" />
    </div>
  );
}
