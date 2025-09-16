import * as d3 from "d3";
import React, { useEffect, useMemo, useRef } from "react";
import useResizeObserver from "../../lib/useResizeObserver";

type TV = {
  title: string;
  release_year: number;
  seasons: number | null;
  rating_group: "Kids" | "Teen" | "Adult" | "Other";
  primary_genre: string | null;
  primary_country: string | null;
};

const ORDER: TV["rating_group"][] = ["Kids", "Teen", "Adult", "Other"];

export default function TVSeasons({
  data,
  onBrush,
}: {
  data: TV[];
  onBrush?: (range: [number, number] | null) => void;
}) {
  const { ref, size } = useResizeObserver<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement | null>(null);

  const groups = useMemo(() => ORDER.filter(g => data.some(d => d.rating_group === g)), [data]);

  const stats = useMemo(() => {
    const by = d3.group(
      data.filter(d => d.seasons != null),
      d => d.rating_group
    );
    return groups.map(g => {
      const arr = (by.get(g) ?? []).map(d => d.seasons as number).sort(d3.ascending);
      const q1 = d3.quantile(arr, 0.25) ?? 0;
      const q2 = d3.quantile(arr, 0.50) ?? 0;
      const q3 = d3.quantile(arr, 0.75) ?? 0;
      const iqr = q3 - q1;
      const low = d3.max([d3.min(arr) ?? 0, q1 - 1.5 * iqr]) ?? 0;
      const high = d3.min([d3.max(arr) ?? 0, q3 + 1.5 * iqr]) ?? 0;
      return { group: g, low, q1, q2, q3, high, values: arr };
    });
  }, [data, groups]);

  useEffect(() => {
    const { width, height } = size;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    if (width < 10 || height < 10 || stats.length === 0) return;

    const margin = { top: 10, right: 10, bottom: 28, left: 48 };
    const w = width - margin.left - margin.right;
    const h = height - margin.top - margin.bottom;

    const x = d3.scaleBand<string>().domain(groups).range([0, w]).padding(0.35);
    const y = d3.scaleLinear()
      .domain([0, d3.max(stats, s => s.high) ?? 5])
      .nice()
      .range([h, 0]);

    const color = d3.scaleOrdinal<string, string>()
      .domain(groups)
      .range(d3.schemeSet3 as any);

    const root = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    // axes
    root.append("g").attr("transform", `translate(0,${h})`).call(d3.axisBottom(x))
      .selectAll("text").attr("fill", "white");
    root.append("g").call(d3.axisLeft(y)).selectAll("text").attr("fill", "white");
    root.selectAll(".domain,.tick line").attr("stroke", "rgba(255,255,255,0.4)");

    // tooltip
    const tip = d3.select(ref.current)
      .append("div")
      .style("position","absolute")
      .style("pointer-events","none")
      .style("background","#000a")
      .style("padding","6px 8px")
      .style("border","1px solid rgba(255,255,255,0.25)")
      .style("borderRadius","8px")
      .style("color","#fff")
      .style("font","12px system-ui")
      .style("opacity","0");

    // jitter points with titles
    type Sample = { x: string; y: number; title: string };
    const sample: Sample[] = [];
    const byGroup = d3.group(
      data.filter(d => d.seasons != null),
      d => d.rating_group
    );
    for (const g of groups) {
      const arr = (byGroup.get(g) ?? []).map(d => ({ x: g, y: d.seasons as number, title: d.title }));
      const step = Math.max(1, Math.ceil(arr.length / 250));
      arr.forEach((v, i) => { if (i % step === 0) sample.push(v); });
    }

    const points = root.append("g")
      .selectAll("circle")
      .data(sample)
      .join("circle")
      .attr("cx", d => (x(d.x) ?? 0) + (x.bandwidth() / 2) + (Math.random() - 0.5) * x.bandwidth() * 0.6)
      .attr("cy", d => y(d.y))
      .attr("r", 2.1)
      .attr("fill", "#cbd5e1")
      .attr("opacity", 0.7)
      .on("mouseenter", function (event, d) {
        d3.select(this).attr("r", 3);
        tip.style("opacity", "1")
           .html(`<b>${d.title}</b><div>${d.y} season(s)</div>`);
      })
      .on("mousemove", function (event) {
        const [mx, my] = d3.pointer(event, svg.node() as any);
        tip.style("left", `${mx + 12}px`).style("top", `${my + 12}px`);
      })
      .on("mouseleave", function () {
        d3.select(this).attr("r", 2.1);
        tip.style("opacity", "0");
      });

    // boxes + hover highlight
    const box = root.append("g").selectAll("g.box")
      .data(stats)
      .join("g")
      .attr("class", "box")
      .attr("transform", d => `translate(${x(d.group)},0)`);

    const label = root.append("g").style("pointer-events", "none");
    function showLabel(s: (typeof stats)[number]) {
      label.selectAll("*").remove();
      label.append("text")
        .attr("x", (x(s.group) ?? 0) + x.bandwidth() / 2)
        .attr("y", y(s.q3) - 8)
        .attr("text-anchor", "middle")
        .attr("fill", "#fff")
        .attr("font-size", 11)
        .text(`${s.group}: median ${Math.round(s.q2)} seasons`);
    }
    function clearLabel() { label.selectAll("*").remove(); }

    box.on("mouseenter", function (_e, d) {
        root.selectAll<SVGElement, any>("g.box").attr("opacity", 0.25);
        d3.select(this).attr("opacity", 1);
        points.attr("opacity", p => (p.x === d.group ? 0.9 : 0.15));
        showLabel(d);
      })
      .on("mouseleave", function () {
        root.selectAll<SVGElement, any>("g.box").attr("opacity", 1);
        points.attr("opacity", 0.7);
        clearLabel();
      });

    // box shape
    box.append("rect")
      .attr("x", 0)
      .attr("y", d => y(d.q3))
      .attr("width", x.bandwidth())
      .attr("height", d => y(d.q1) - y(d.q3))
      .attr("fill", d => color(d.group))
      .attr("opacity", 0.95)
      .attr("stroke", "rgba(255,255,255,0.6)");

    box.append("line")
      .attr("x1", 0).attr("x2", x.bandwidth())
      .attr("y1", d => y(d.q2)).attr("y2", d => y(d.q2))
      .attr("stroke", "white").attr("stroke-width", 2);

    box.append("line").attr("x1", x.bandwidth()/2).attr("x2", x.bandwidth()/2)
      .attr("y1", d => y(d.low)).attr("y2", d => y(d.q1))
      .attr("stroke", "rgba(255,255,255,0.6)");
    box.append("line").attr("x1", x.bandwidth()/2).attr("x2", x.bandwidth()/2)
      .attr("y1", d => y(d.q3)).attr("y2", d => y(d.high))
      .attr("stroke", "rgba(255,255,255,0.6)");
    box.append("line").attr("x1", x.bandwidth()*0.2).attr("x2", x.bandwidth()*0.8)
      .attr("y1", d => y(d.low)).attr("y2", d => y(d.low))
      .attr("stroke", "rgba(255,255,255,0.6)");
    box.append("line").attr("x1", x.bandwidth()*0.2).attr("x2", x.bandwidth()*0.8)
      .attr("y1", d => y(d.high)).attr("y2", d => y(d.high))
      .attr("stroke", "rgba(255,255,255,0.6)");

    // title
    root.append("text")
      .attr("x", 0)
      .attr("y", -2)
      .attr("fill", "white")
      .attr("font-size", 12)
      .text("TV seasons by rating");

    // brush
    const brush = d3.brushY()
      .extent([[w + 6, 0], [w + 16, h]])
      .on("end", (event) => {
        const sel: [number, number] | null = event.selection;
        if (!onBrush) return;
        if (!sel) { onBrush(null); return; }
        const y1 = Math.round(y.invert(sel[1]));
        const y0 = Math.round(y.invert(sel[0]));
        const lo = Math.max(0, Math.min(y0, y1));
        const hi = Math.max(y0, y1);
        onBrush([lo, hi]);
      });

    root.append("g").attr("class", "y-brush").call(brush);

  }, [size, stats, groups, data, onBrush]);

  return (
    <div ref={ref} className="w-full h-full relative">
      <svg ref={svgRef} className="w-full h-full" />
    </div>
  );
}
