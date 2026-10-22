import { useEffect, useMemo, useState } from "react";
import ReactFlow, { Background, Controls, MarkerType, useNodesState } from "reactflow";
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
  const markerEnd = { type: MarkerType.ArrowClosed, color: "#94a3b8" };
  switch (e.type) {
    case "calls":
      return { animated: false, markerEnd, style: { stroke: "#94a3b8", strokeWidth: 1 } };
    case "imports":
      return {
        animated: false,
        markerEnd: { ...markerEnd, color: "#64748b" },
        style: { stroke: "#64748b", strokeWidth: 1, strokeDasharray: "5 5" },
      };
    case "inherits":
      return {
        animated: false,
        markerEnd: { ...markerEnd, color: "#34d399" },
        style: { stroke: "#34d399", strokeWidth: 3 },
      };
    case "defines":
      return {
        animated: false,
        markerEnd: {
          ...markerEnd,
          color: "#fbbf24",
          width: 20,
          height: 20,
        },
        labelStyle: { fill: "#fef3c7", fontWeight: 700 },
        labelBgStyle: { fill: "#78350f", fillOpacity: 0.95 },
        labelBgPadding: [6, 3],
        labelBgBorderRadius: 4,
        style: { stroke: "#fbbf24", strokeWidth: 2.5 },
      };
    default:
      return {
        animated: false,
        markerEnd: { ...markerEnd, color: "#64748b" },
        style: { stroke: "#64748b", strokeWidth: 1 },
      };
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
  const [flowInstance, setFlowInstance] = useState(null);

  const visible = useMemo(() => {
    let list = nodes;
    if (activeFile !== null) {
      const fileNodeIds = new Set(
        nodes.filter((node) => node.file === activeFile).map((node) => node.id),
      );
      const relatedIds = new Set(fileNodeIds);
      for (const edge of edges) {
        if (fileNodeIds.has(edge.source)) {
          relatedIds.add(edge.target);
        }
        if (fileNodeIds.has(edge.target)) {
          relatedIds.add(edge.source);
        }
      }
      const relatedModuleFiles = new Set(
        nodes
          .filter((node) => node.type === "module" && relatedIds.has(node.id))
          .map((node) => node.file)
          .filter((file) => file !== undefined && file !== activeFile),
      );
      for (const node of nodes) {
        if (relatedModuleFiles.has(node.file)) {
          relatedIds.add(node.id);
        }
      }
      list = nodes.filter((node) => relatedIds.has(node.id));
    }
    if (hideExternal) {
      list = list.filter((n) => n.type !== "external");
    }
    return list;
  }, [nodes, edges, activeFile, hideExternal]);
  const visibleById = useMemo(
    () => new Map(visible.map((node) => [node.id, node])),
    [visible],
  );

  const q = query.trim().toLowerCase();
  const matchIds = useMemo(() => {
    if (q === "") {
      return null;
    }
    return new Set(
      visible.filter((n) => n.id.toLowerCase().includes(q)).map((n) => n.id),
    );
  }, [visible, q]);

  const layoutNodes = useMemo(() => {
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
      return {
        id: n.id,
        data: { label: n.id },
        position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 },
        width: NODE_W,
        height: NODE_H,
      };
    });
  }, [visible, edges]);

  useEffect(() => {
    if (flowInstance === null || layoutNodes.length === 0) {
      return undefined;
    }
    const frame = requestAnimationFrame(() => {
      flowInstance.fitView({ padding: 0.15, duration: 250 });
    });
    return () => cancelAnimationFrame(frame);
  }, [flowInstance, layoutNodes]);

  const flowNodes = useMemo(
    () => layoutNodes.map((node) => {
      const original = visibleById.get(node.id);
      const dimmed = matchIds !== null && !matchIds.has(node.id);
      return {
        ...node,
        data: { label: node.id },
        style: {
          width: NODE_W,
          height: NODE_H,
          ...styleFor(original, selectedNodeId === node.id, dimmed),
          boxShadow: selectedNodeId === node.id ? "0 0 0 3px #38bdf8" : undefined,
        },
      };
    }),
    [layoutNodes, visibleById, matchIds, selectedNodeId],
  );

  const [displayNodes, setDisplayNodes, onNodesChange] = useNodesState(flowNodes);

  useEffect(() => {
    setDisplayNodes((currentNodes) => {
      const currentById = new Map(currentNodes.map((node) => [node.id, node]));
      return flowNodes.map((node) => {
        const current = currentById.get(node.id);
        return current === undefined ? node : { ...node, position: current.position };
      });
    });
  }, [flowNodes, setDisplayNodes]);

  useEffect(() => {
    if (flowInstance === null || selectedNodeId === null) {
      return;
    }
    const node = flowInstance.getNode(selectedNodeId);
    if (node === undefined) {
      return;
    }
    const currentZoom = flowInstance.getZoom();
    const position = node.positionAbsolute ?? node.position;
    flowInstance.setCenter(
      position.x + NODE_W / 2,
      position.y + NODE_H / 2,
      { zoom: Math.max(currentZoom, 0.8), duration: 400 },
    );
  }, [flowInstance, selectedNodeId]);

  const visibleIds = useMemo(() => new Set(visible.map((node) => node.id)), [visible]);

  const flowEdges = useMemo(
    () =>
      edges
        .filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target))
        .map((e) => ({
          id: `${e.source}->${e.target}:${e.type}`,
          source: e.source,
          target: e.target,
          label: e.type === "defines" ? "defines →" : e.type,
          ...edgePropsFor(e),
        })),
    [edges, visibleIds],
  );
  const crossFileNodeCount = useMemo(() => {
    if (activeFile === null) {
      return 0;
    }
    return visible.filter((node) => node.file !== undefined && node.file !== activeFile).length;
  }, [activeFile, visible]);

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
        <button
          type="button"
          onClick={() => flowInstance?.fitView({ padding: 0.15, duration: 250 })}
          disabled={flowInstance === null}
          className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700 disabled:opacity-50"
        >
          Fit graph
        </button>
      </div>
      <p className="border-b border-slate-800 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-400">
        <span className="font-semibold text-amber-300">defines →</span> means the file/module node points to a function, class, or variable declared in that file.
      </p>
      {activeFile === null ? (
        <p className="border-b border-amber-900 bg-amber-950/60 px-3 py-2 text-xs text-amber-200">
          Full-project graph: {nodes.length} nodes and {edges.length} links. Large projects may render slowly; select a file to focus on it and directly connected nodes from other files.
        </p>
      ) : (
        <p className="border-b border-slate-800 bg-slate-900/70 px-3 py-2 text-xs text-slate-300">
          Focused on <span className="font-mono text-slate-100">{activeFile}</span>: {visible.length} nodes, including {crossFileNodeCount} directly connected nodes from other files.
        </p>
      )}
      <div className="flex-1 min-h-0">
        <ReactFlow
          key={activeFile ?? "all-files"}
          nodes={displayNodes}
          edges={flowEdges}
          onNodesChange={onNodesChange}
          onInit={setFlowInstance}
          onNodeClick={(_, node) => onNodeClick(node.id)}
          onPaneClick={onClearSelection}
          nodesDraggable
          nodesConnectable={false}
          nodesFocusable={false}
          edgesFocusable={false}
          onlyRenderVisibleElements
          minZoom={0.05}
          maxZoom={2.5}
          fitView
          fitViewOptions={{ padding: 0.15 }}
        >
          <Background color="#1e293b" />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}
