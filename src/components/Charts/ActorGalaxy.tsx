import * as d3 from "d3";
import React, { useEffect, useMemo, useRef, useState } from "react";
import useResizeObserver from "../../lib/useResizeObserver";

type Node = {
  id: string;
  label: string;
  degree: number;           // sum of weights
  dominant_genre: string | null;
  count: number;            // #titles they appear in
};
type Edge = {
  source: string;
  target: string;
  weight: number;           // #co-appearances
};

const PASTELS = [
  "#ed64a6", "#60a5fa", "#fbbf24", "#34d399", "#a78bfa",
  "#fb7185", "#22d3ee", "#f472b6", "#93c5fd", "#f59e0b"
];

function genreColor(genre: string | null) {
  if (!genre) return "#e5e7eb";
  const h = Math.abs(
    [...genre].reduce((a, c) => a + c.charCodeAt(0), 0)
  ) % PASTELS.length;
  return PASTELS[h];
}

export default function ActorGalaxy({
  nodes,
  edges,
  onPick,             // callback when an actor is focused (or null to clear)
}: {
  nodes: Node[];
  edges: Edge[];
  onPick?: (actor: string | null) => void;
}) {
  const { ref, size } = useResizeObserver<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement | null>(null);

  // local UI controls
  const [minWeight, setMinWeight] = useState(2);
  const [focus, setFocus] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const keepE = edges.filter(e => e.weight >= minWeight);
    const used = new Set<string>();
    keepE.forEach(e => { used.add(e.source); used.add(e.target); });
    const keepN = nodes.filter(n => used.has(n.id));
    return { keepN, keepE };
  }, [nodes, edges, minWeight]);

  useEffect(() => {
    const { width, height } = size;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    if (width < 10 || height < 10 || filtered.keepN.length === 0) return;

    // defs: soft glow + arrowhead
    const defs = svg.append("defs");
    const glow = defs.append("filter").attr("id", "glow");
    glow.append("feGaussianBlur").attr("stdDeviation", 3).attr("result", "coloredBlur");
    const feMerge = glow.append("feMerge");
    feMerge.append("feMergeNode").attr("in", "coloredBlur");
    feMerge.append("feMergeNode").attr("in", "SourceGraphic");

    // zoom/pan
    const g = svg.append("g");
    svg.call(
      d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.3, 3]).on("zoom", (e) => {
        g.attr("transform", e.transform.toString());
      })
    );

    // build sim
    const sim = d3.forceSimulation(filtered.keepN as any)
      .force("link", d3.forceLink(filtered.keepE as any).id((d: any) => d.id).distance(d => 160 - Math.min(120, (d as any).weight * 15)).strength(0.4))
      .force("charge", d3.forceManyBody().strength(-60))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide<Node>().radius(d => 8 + Math.sqrt(d.count || 1)));

    // edges
    const link = g.append("g")
      .attr("stroke", "rgba(255,255,255,0.25)")
      .attr("stroke-linecap", "round")
      .selectAll("line")
      .data(filtered.keepE)
      .join("line")
      .attr("stroke-width", d => Math.max(1, Math.min(4, d.weight)));

    // nodes
    const rScale = d3.scaleSqrt().domain([1, d3.max(nodes, d => d.count || 1) || 1]).range([3, 12]);

    const node = g.append("g")
      .selectAll("g.node")
      .data(filtered.keepN)
      .join("g")
      .attr("class", "node")
      .call(
        d3.drag<SVGGElement, Node>()
          .on("start", (e, d) => {
            if (!e.active) sim.alphaTarget(0.3).restart();
            (d as any).fx = d.x;
            (d as any).fy = d.y;
          })
          .on("drag", (e, d) => {
            (d as any).fx = e.x;
            (d as any).fy = e.y;
          })
          .on("end", (e, d) => {
            if (!e.active) sim.alphaTarget(0);
            (d as any).fx = null;
            (d as any).fy = null;
          })
      )
      .on("mouseenter", function (_e, d) {
        // highlight ego network
        setHover(d.id);
      })
      .on("mouseleave", function () {
        setHover(null);
      })
      .on("click", (_e, d) => {
        const next = focus === d.id ? null : d.id;
        setFocus(next);
        onPick?.(next);
      });

    node.append("circle")
      .attr("r", d => rScale(d.count || 1))
      .attr("fill", d => genreColor(d.dominant_genre))
      .attr("stroke", "white")
      .attr("stroke-opacity", 0.35)
      .attr("filter", "url(#glow)");

    node.append("title")
      .text(d =>
        `${d.label}\nTitles: ${d.count}\nGenre: ${d.dominant_genre ?? "—"}`
      );

    // labels for focused nodes (avoid clutter)
    const label = g.append("g")
      .selectAll("text")
      .data(filtered.keepN)
      .join("text")
      .attr("fill", "white")
      .attr("font-size", 10)
      .attr("opacity", 0.0)
      .attr("text-anchor", "middle")
      .text(d => d.label);

    // ego-network highlight bookkeeping
    let hoverId: string | null = null;
    function setHover(id: string | null) {
      hoverId = id;
      updateStyles();
    }
    function updateStyles() {
      if (!hoverId && !focus) {
        link.attr("stroke-opacity", 0.3);
        node.attr("opacity", 1);
        label.attr("opacity", 0);
        return;
      }
      const active = new Set<string>();
      if (hoverId || focus) {
        const id = (focus ?? hoverId)!;
        filtered.keepE.forEach(e => {
          if (e.source === id || e.target === id) {
            active.add(typeof e.source === "string" ? e.source : (e.source as any).id);
            active.add(typeof e.target === "string" ? e.target : (e.target as any).id);
          }
        });
        active.add(id);
      }
      link.attr("stroke-opacity", d => {
        const s = typeof d.source === "string" ? d.source : (d.source as any).id;
        const t = typeof d.target === "string" ? d.target : (d.target as any).id;
        return active.has(s) && active.has(t) ? 0.9 : 0.06;
      });
      node.attr("opacity", d => (active.has(d.id) ? 1 : 0.1));
      label.attr("opacity", d => (active.has(d.id) ? 0.9 : 0));
    }

    sim.on("tick", () => {
      link
        .attr("x1", d => (d.source as any).x)
        .attr("y1", d => (d.source as any).y)
        .attr("x2", d => (d.target as any).x)
        .attr("y2", d => (d.target as any).y);

      node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
      label.attr("x", (d: any) => d.x).attr("y", (d: any) => (d.y || 0) - (rScale(d.count || 1) + 8));
    });

    // initial style
    updateStyles();

    return () => {
      sim.stop();
    };
  }, [size, filtered, nodes, edges, onPick, focus]);

  return (
    <div ref={ref} className="w-full h-full relative">
      {/* control bar */}
      <div className="absolute left-2 top-2 z-10 flex items-center gap-2 text-xs">
        <span className="opacity-70">Min link:</span>
        <input
          type="range"
          min={1}
          max={6}
          value={minWeight}
          onChange={(e) => setMinWeight(+e.target.value)}
        />
        <span className="opacity-80">{minWeight}</span>
        <button
          onClick={() => { setMinWeight(2); setFocus(null); onPick?.(null); }}
          className="ml-2 px-2 py-1 rounded bg-white/10 border border-white/20 hover:bg-white/20"
        >
          Reset view
        </button>
      </div>
      <svg ref={svgRef} className="w-full h-full" />
      {/* Legend */}
      <div className="absolute right-2 top-2 text-xs bg-black/40 rounded-md border border-white/20 p-2">
        <div className="mb-1 opacity-80">Dominant genre</div>
        <div className="grid grid-cols-2 gap-1 max-w-[200px]">
          {["Action & Adventure","Comedies","Dramas","Horror","International","Children & Family","Sci-Fi","Documentaries","Romantic","Crime"].map((g,i)=>(
            <div key={i} className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-sm" style={{background: PASTELS[i%PASTELS.length]}}/>
              <span className="opacity-80 whitespace-nowrap overflow-hidden text-ellipsis">{g}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
