import { useMemo, useState } from "react";
import ReactFlow, { Background, Controls } from "reactflow";
import dagre from "dagre";
import "reactflow/dist/style.css";

const NODE_W = 200;
const NODE_H = 50;

/**
 * Style a graph node by its backend node type.
 * @param {import("../../types.js").Node} n Backend graph node.
 * @param {boolean} selected Whether this node is the selected one.
 * @param {boolean} dimmed Whether this node is faded (filter/search).
 * @returns {object} React Flow node style object.
 */
function styleFor(n, selected, dimmed) {
  const base = {
    padding: 8,
    fontSize: 11,
    fontFamily: "monospace",
    opacity: dimmed ? 0.15 : 1,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#475569",
    ring: undefined,
  };
  switch (n.type) {
    case "module":
      return {
        ...base,
        background: "#1e293b",
        color: "#e2e8f0",
        borderRadius: 8,
      };
    case "function":
      return {
        ...base,
        background: "#312e81",
        color: "#e0e7ff",
        borderRadius: 8,
        borderColor: "#818cf8",
      };
    case "method":
      return {
        ...base,
        background: "#312e81",
        color: "#e0e7ff",
        borderRadius: 8,
        borderColor: "#818cf8",
        borderStyle: "dashed",
      };
    case "class":
      return {
        ...base,
        background: "#064e3b",
        color: "#a7f3d0",
        borderRadius: 8,
        borderColor: "#34d399",
      };
    case "variable":
      return {
        ...base,
        background: "#78350f",
        color: "#fde68a",
        borderRadius: 0,
        transform: "rotate(0deg)",
        borderColor: "#fbbf24",
        clipPath: "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)",
      };
    case "external":
      return {
        ...base,
        background: "#334155",
        color: "#cbd5e1",
        borderRadius: 999,
        opacity: dimmed ? 0.15 : 0.7,
      };
    default:
      return {
        ...base,
        background: "#1e293b",
        color: "#e2e8f0",
        borderRadius: 8,
      };
  }
}

/**
 * Style a graph edge by its backend edge type.
 * @param {import("../../types.js").Edge} e Backend graph edge.
 * @returns {object} React Flow edge props.
 */
function edgePropsFor(e) {
  switch (e.type) {
    case "calls":
      return { animated: false, style: { stroke: "#94a3b8", strokeWidth: 1 } };
    case "imports":
      return {
        animated: false,
        style: { stroke: "#64748b", strokeWidth: 1, strokeDasharray: "5 5" },
      };
    case "inherits":
      return { animated: false, style: { stroke: "#34d399", strokeWidth: 3 } };
    case "defines":
      return { animated: false, style: { stroke: "#475569", strokeWidth: 1 } };
    default:
      return { animated: false, style: { stroke: "#64748b", strokeWidth: 1 } };
  }
}

/**
 * CodeGraph — React Flow rendering of the backend code graph.
 * @param {object} props
 * @param {import("../../types.js").Node[]} props.nodes
 * @param {import("../../types.js").Edge[]} props.edges
 * @param {string | null} props.activeFile
 * @param {string | null} props.selectedNodeId
 * @param {(id: string) => void} props.onNodeClick
 * @param {() => void} props.onClearSelection
 * @returns {import("react").JSX.Element} The graph canvas.
 */
export default function CodeGraph({
  nodes,
  edges,
  activeFile,
  selectedNodeId,
  onNodeClick,
  onClearSelection,
}) {
  const [query, setQuery] = useState("");
  const [hideExternal, setHideExternal] = useState(false);

  const visible = useMemo(() => {
    let list = nodes;
    if (hideExternal) {
      list = list.filter((n) => n.type !== "external");
    }
    return list;
  }, [nodes, hideExternal]);

  const neighborIds = useMemo(() => {
    if (activeFile === null) {
      return null;
    }
    const ids = new Set(
      nodes.filter((n) => n.file === activeFile).map((n) => n.id),
    );
    for (const e of edges) {
      if (ids.has(e.source)) {
        ids.add(e.target);
      }
      if (ids.has(e.target)) {
        ids.add(e.source);
      }
    }
    return ids;
  }, [nodes, edges, activeFile]);

  const q = query.trim().toLowerCase();
  const matchIds = useMemo(() => {
    if (q === "") {
      return null;
    }
    return new Set(
      visible.filter((n) => n.id.toLowerCase().includes(q)).map((n) => n.id),
    );
  }, [visible, q]);

  const flowNodes = useMemo(() => {
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: "LR", nodesep: 50, ranksep: 100 });
    g.setDefaultEdgeLabel(() => ({}));
    for (const n of visible) {
      g.setNode(n.id, { width: NODE_W, height: NODE_H });
    }
    for (const e of edges) {
      if (g.hasNode(e.source) && g.hasNode(e.target)) {
        g.setEdge(e.source, e.target);
      }
    }
    dagre.layout(g);
    return visible.map((n) => {
      const pos = g.node(n.id);
      const dimmed =
        (neighborIds !== null && !neighborIds.has(n.id)) ||
        (matchIds !== null && !matchIds.has(n.id));
      return {
        id: n.id,
        data: { label: n.id },
        position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 },
        style: {
          width: NODE_W,
          ...styleFor(n, selectedNodeId === n.id, dimmed),
          boxShadow: selectedNodeId === n.id ? "0 0 0 3px #38bdf8" : undefined,
        },
      };
    });
  }, [visible, edges, neighborIds, matchIds, selectedNodeId]);

  const flowEdges = useMemo(
    () =>
      edges
        .filter(
          (e) =>
            visible.some((n) => n.id === e.source) &&
            visible.some((n) => n.id === e.target),
        )
        .map((e) => ({
          id: `${e.source}->${e.target}:${e.type}`,
          source: e.source,
          target: e.target,
          label: e.type,
          ...edgePropsFor(e),
        })),
    [edges, visible],
  );

  /**
   * Jump to the first search match on Enter.
   * @param {import("react").KeyboardEvent} ev Key event.
   * @returns {void}
   */
  function onSearchKey(ev) {
    if (ev.key !== "Enter" || matchIds === null) {
      return;
    }
    const first = visible.find((n) => matchIds.has(n.id));
    if (first !== undefined) {
      onNodeClick(first.id);
    }
  }

  return (
    <div className="flex-col h-full flex">
      <div className="gap-3 p-2 border-b border-slate-800 flex items-center">
        <input
          type="text"
          value={query}
          onChange={(ev) => setQuery(ev.target.value)}
          onKeyDown={onSearchKey}
          placeholder="Search nodes…"
          className="px-2 py-1 w-64 rounded bg-slate-800 text-sm text-slate-200 placeholder:text-slate-500"
        />
        <label className="gap-1 text-xs text-slate-400 flex items-center">
          <input
            type="checkbox"
            checked={hideExternal}
            onChange={(ev) => setHideExternal(ev.target.checked)}
          />
          Hide external nodes
        </label>
      </div>
      <div className="flex-1 min-h-0">
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          onNodeClick={(_, node) => onNodeClick(node.id)}
          onPaneClick={onClearSelection}
          fitView
        >
          <Background color="#1e293b" />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}
