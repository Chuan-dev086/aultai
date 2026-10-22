import { promises as fs } from "node:fs";
import traverse from "@babel/traverse";
import * as babelParser from "@babel/parser";
import { getActiveSubdir, getActiveWorkspace, safePath, listJsFiles, readFile } from "./sandbox.js";
import { parseFile } from "./parser.js";

const walk = traverse.default ?? traverse;

/**
 * Build the code graph over every .js file in the active workspace.
 * When the active workspace is shop-api, only it is indexed; when it is
 * dynamic_project, only the uploaded project is indexed.
 * Files with invalid syntax are skipped (reported in files[].parse_error)
 * so one bad file never crashes the graph.
 * @returns {Promise<{ nodes: object[], edges: object[], files: object[] }>} The code graph.
 */
export async function buildGraph() {
  const active = getActiveSubdir();
  const relFiles = await listJsFiles(active);
  const root = getActiveWorkspace();
  const nodes = [];
  const files = [];
  const byId = new Map();
  const moduleOf = new Map();

  for (const rel of relFiles) {
    const abs = await safePath(rel);
    let text = null;
    try {
      text = await fs.readFile(abs, "utf8");
    } catch {
      files.push({ path: rel, node_count: 0, parse_error: "unreadable file" });
      continue;
    }
    let parsed = null;
    try {
      parsed = parseFile(abs, root, text);
    } catch {
      files.push({ path: rel, node_count: 0, parse_error: "syntax error, skipped" });
      continue;
    }
    moduleOf.set(parsed.nodes[0].id, parsed.nodes[0].file);
    for (const n of parsed.nodes) {
      nodes.push(n);
      byId.set(n.id, n);
    }
    files.push({ path: rel, node_count: parsed.nodes.length });
  }
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  // Module id per file. Module ids may contain dots (e.g. "test_checkout.test"),
  // so never derive the module from n.id.split(".")[0].
  const fileToModule = new Map();
  for (const n of nodes) {
    if (n.type === "module") {
      fileToModule.set(n.file, n.id);
    }
  }

  // Index exported/local names per module for call resolution.
  const moduleNames = new Map();
  for (const n of nodes) {
    if (n.type === "module") {
      continue;
    }
    const mod = fileToModule.get(n.file);
    if (!moduleNames.has(mod)) {
      moduleNames.set(mod, new Map());
    }
    const short = n.name;
    if (!moduleNames.get(mod).has(short)) {
      moduleNames.get(mod).set(short, n.id);
    }
  }

  // Import tables: importingModule -> localName -> { fromModule, imported }.
  const importTables = new Map();
  const rawEdges = [];
  for (const rel of relFiles) {
    const abs = await safePath(rel);
    let text = null;
    try {
      text = await readFile(rel);
    } catch {
      continue;
    }
    let ast = null;
    try {
      ast = babelParser.parse(text, {
        sourceType: "module",
        plugins: ["jsx", "classProperties"],
        attachComment: true,
      });
    } catch {
      continue;
    }
    const mod = rel.split("/").pop().replace(/\.(js|jsx)$/, "");
    const table = {};
    const selfId = mod;
    walk(ast, {
      ImportDeclaration(p) {
        const src = p.node.source.value;
        const fromModule = resolveImportToModule(src, mod, moduleNames);
        for (const spec of p.node.specifiers) {
          const local = spec.local.name;
          const imported =
            spec.type === "ImportDefaultSpecifier"
              ? "default"
              : (spec.imported?.name ?? local);
          table[local] = { fromModule, imported };
        }
        if (fromModule !== null) {
          rawEdges.push({ source: selfId, target: fromModule, type: "imports" });
        }
      },
      ClassDeclaration(p) {
        const superCls = p.node.superClass;
        if (superCls !== null && superCls !== undefined && superCls.type === "Identifier") {
          rawEdges.push({
            source: `${mod}.${p.node.id?.name ?? "unknown"}`,
            target: superCls.name,
            type: "inherits",
          });
        }
      },
      CallExpression(p) {
        const name = calleeName(p.node.callee);
        if (name === null) {
          return;
        }
        const enclosing = p.getFunctionParent();
        const source = enclosingFunctionId(enclosing, text, mod);
        const target = resolveCall(name, mod, table, byId, moduleNames);
        rawEdges.push({ source, target, type: "calls" });
      },
    });
    importTables.set(mod, table);
  }

  // Materialize external targets + fix inherits short names.
  const finalEdges = [];
  const seen = new Set();
  const ensureExternal = (name) => {
    const id = `external:${name}`;
    if (!byId.has(id)) {
      const node = { id, type: "external", name };
      byId.set(id, node);
      nodes.push(node);
    }
    return id;
  };
  for (const e of rawEdges) {
    let { source, target, type } = e;
    if (source === null || target === null) {
      continue;
    }
    if (type === "inherits") {
      target = byId.has(target) ? target : ensureExternal(target);
    } else if (type === "calls") {
      if (!byId.has(target)) {
        target = ensureExternal(target.split(".").pop());
      }
    }
    if (!byId.has(source) && type === "calls") {
      source = ensureExternal(source.split(".").pop());
    }
    const key = `${source}\u0000${target}\u0000${type}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    finalEdges.push({ source, target, type });
  }

  // "defines": module -> each top-level function/class/variable.
  for (const n of nodes) {
    if (n.type === "module" || n.type === "external") {
      continue;
    }
    const mod = fileToModule.get(n.file);
    if (mod === undefined) {
      continue;
    }
    const key = `${mod}\u0000${n.id}\u0000defines`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    finalEdges.push({ source: mod, target: n.id, type: "defines" });
  }

  // depth: BFS from nodes with no incoming "calls" edges.
  const incoming = new Map();
  for (const n of nodes) {
    incoming.set(n.id, 0);
  }
  for (const e of finalEdges) {
    if (e.type === "calls" && incoming.has(e.target)) {
      incoming.set(e.target, incoming.get(e.target) + 1);
    }
  }
  const depth = new Map();
  const queue = [];
  for (const [id, count] of incoming) {
    if (count === 0) {
      depth.set(id, 0);
      queue.push(id);
    }
  }
  const callsFrom = new Map();
  for (const e of finalEdges) {
    if (e.type !== "calls") {
      continue;
    }
    if (!callsFrom.has(e.source)) {
      callsFrom.set(e.source, []);
    }
    callsFrom.get(e.source).push(e.target);
  }
  while (queue.length > 0) {
    const cur = queue.shift();
    const next = (callsFrom.get(cur) ?? []).slice().sort();
    for (const t of next) {
      if (!depth.has(t)) {
        depth.set(t, depth.get(cur) + 1);
        queue.push(t);
      }
    }
  }
  for (const n of nodes) {
    n.depth = depth.has(n.id) ? depth.get(n.id) : 0;
  }

  return { nodes, edges: finalEdges, files };
}

/**
 * Extract a static callee name from a CallExpression callee.
 * @param {object} callee Babel callee node.
 * @returns {string | null} Dotted name (e.g. "res.json") or bare name, else null.
 */
function calleeName(callee) {
  if (callee.type === "Identifier") {
    return callee.name;
  }
  if (callee.type === "MemberExpression" && !callee.computed && callee.property.type === "Identifier") {
    if (callee.object.type === "Identifier") {
      return `${callee.object.name}.${callee.property.name}`;
    }
    return callee.property.name;
  }
  return null;
}

/**
 * Find the enclosing function id for a call site, falling back to module id.
 * @param {object | null} fnPath Babel function parent path (or null at top level).
 * @param {string} text File contents (unused; kept for future offset lookup).
 * @param {string} mod Module basename.
 * @returns {string} Node id of the enclosing scope.
 */
function enclosingFunctionId(fnPath, text, mod) {
  void text;
  if (fnPath === null || fnPath === undefined) {
    return mod;
  }
  const node = fnPath.node;
  if (node.type === "FunctionDeclaration" && node.id !== null) {
    return `${mod}.${node.id.name}`;
  }
  const parent = fnPath.parentPath?.node;
  if (parent !== undefined && parent.type === "VariableDeclarator" && parent.id.type === "Identifier") {
    return `${mod}.${parent.id.name}`;
  }
  if (node.type === "ClassMethod") {
    const cls = fnPath.findParent((p) => p.isClassDeclaration());
    const clsName = cls?.node?.id?.name ?? "unknown";
    return `${mod}.${clsName}.${node.key.name ?? "constructor"}`;
  }
  return mod;
}

/**
 * Resolve a static import source to a known module basename, if possible.
 * @param {string} src Raw import specifier (e.g. "./pricing.js").
 * @param {string} fromMod Importing module basename.
 * @param {Map<string, Map<string, string>>} moduleNames Known modules and their defs.
 * @returns {string | null} Target module basename or null when unknown.
 */
function resolveImportToModule(src, fromMod, moduleNames) {
  void fromMod;
  if (!src.startsWith(".")) {
    return null;
  }
  const base = src.split("/").pop().replace(/\.(js|jsx)$/, "");
  return moduleNames.has(base) ? base : null;
}

/**
 * Resolve a call name to a node id using imports, then locals, then exports.
 * @param {string} name Static callee name (may be dotted like "res.json").
 * @param {string} mod Calling module basename.
 * @param {object} table Import table for the calling module.
 * @param {Map<string, object>} byId Node index by id.
 * @param {Map<string, Map<string, string>>} moduleNames Defs per module.
 * @returns {string | null} Resolved node id or the raw short name.
 */
function resolveCall(name, mod, table, byId, moduleNames) {
  const short = name.includes(".") ? name.split(".").pop() : name;
  const local = moduleNames.get(mod)?.get(short);
  if (local !== undefined) {
    return local;
  }
  const imp = table[short];
  if (imp !== undefined && imp !== null && imp.fromModule !== null) {
    const targetMod = imp.fromModule;
    if (imp.imported === "default" || imp.imported === "*") {
      if (byId.has(targetMod)) {
        return targetMod;
      }
    } else {
      const candidate = `${targetMod}.${imp.imported}`;
      if (byId.has(candidate)) {
        return candidate;
      }
    }
    const fallback = moduleNames.get(targetMod)?.get(short);
    if (fallback !== undefined) {
      return fallback;
    }
  }
  for (const [m, defs] of moduleNames) {
    if (defs.has(short)) {
      void m;
      return defs.get(short);
    }
  }
  return short;
}
