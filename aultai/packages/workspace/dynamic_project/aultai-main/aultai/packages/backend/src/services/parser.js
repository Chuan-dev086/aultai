import * as parser from "@babel/parser";

/**
 * Parse a JavaScript file into graph nodes (module + functions/classes/vars).
 * @param {string} absPath Absolute path of the file being parsed.
 * @param {string} workspaceRoot Absolute path of the workspace root.
 * @param {string} sourceText File contents.
 * @returns {{ file: string, nodes: object[] }} Module node plus top-level definitions.
 * @throws {Error} When the file contains invalid syntax.
 */
export function parseFile(absPath, workspaceRoot, sourceText) {
  const relFile = toRel(absPath, workspaceRoot);
  const moduleName = moduleBasename(absPath);
  const ast = parser.parse(sourceText, {
    sourceType: "module",
    plugins: ["jsx", "classProperties"],
    attachComment: true,
  });

  const nodes = [
    {
      id: moduleName,
      type: "module",
      name: moduleName,
      file: relFile,
      lineno: 1,
      end_lineno: sourceText.split("\n").length,
      signature: moduleName,
      docstring: null,
      source: sourceText,
    },
  ];
  for (const stmt of ast.program.body) {
    nodes.push(...fromStatement(stmt, moduleName, relFile, sourceText));
  }
  return { file: relFile, nodes };
}

/**
 * Extract graph node(s) from a single top-level statement.
 * @param {object} stmt Babel statement node.
 * @param {string} moduleName Basename of the module (no extension).
 * @param {string} relFile Repo-relative file path.
 * @param {string} sourceText Full file contents.
 * @returns {object[]} Zero or more node records.
 */
function fromStatement(stmt, moduleName, relFile, sourceText) {
  const inner =
    stmt.type === "ExportNamedDeclaration" || stmt.type === "ExportDefaultDeclaration"
      ? stmt.declaration
      : stmt;
  if (inner === null || inner === undefined) {
    return [];
  }
  if (inner.type === "FunctionDeclaration") {
    return [
      makeFunction(inner, inner.id?.name ?? null, inner, moduleName, relFile, sourceText, null, leadingJSDoc(stmt)),
    ];
  }
  if (inner.type === "ClassDeclaration") {
    return [makeClass(inner, moduleName, relFile, sourceText, leadingJSDoc(stmt))];
  }
  if (inner.type === "VariableDeclaration") {
    const out = [];
    for (const decl of inner.declarations) {
      if (decl.id.type !== "Identifier") {
        continue;
      }
      const name = decl.id.name;
      const init = decl.init;
      if (
        init !== null &&
        init !== undefined &&
        (init.type === "FunctionExpression" || init.type === "ArrowFunctionExpression")
      ) {
        out.push(makeFunction(init, name, decl, moduleName, relFile, sourceText, null, leadingJSDoc(stmt)));
      } else {
        out.push({
          id: `${moduleName}.${name}`,
          type: "variable",
          name,
          file: relFile,
          lineno: decl.loc.start.line,
          end_lineno: decl.loc.end.line,
          signature: name,
          docstring: leadingJSDoc(stmt),
          source: slice(sourceText, decl),
        });
      }
    }
    return out;
  }
  return [];
}

/**
 * Build a function node record.
 * @param {object} fn Babel function node (params live here).
 * @param {string | null} name Declared name (null when anonymous).
 * @param {object} anchor Node used for location/source (declarator or fn).
 * @param {string} moduleName Basename of the module.
 * @param {string} relFile Repo-relative file path.
 * @param {string} sourceText Full file contents.
 * @param {string | null} outerName Enclosing function name for nested defs.
 * @param {string | null} outerDoc JSDoc found on an outer export wrapper, if any.
 * @returns {object} The function node record.
 */
function makeFunction(fn, name, anchor, moduleName, relFile, sourceText, outerName, outerDoc = null) {
  const qual =
    name === null
      ? `__anonymous_${anchor.loc.start.line}`
      : outerName === null
        ? name
        : `${outerName}.${name}`;
  const params = fn.params.map((p) => slice(sourceText, p)).join(", ");
  const jsdoc = leadingJSDoc(anchor) ?? outerDoc;
  const returns = jsdocReturn(jsdoc);
  return {
    id: `${moduleName}.${qual}`,
    type: "function",
    name: name ?? `__anonymous_${anchor.loc.start.line}`,
    file: relFile,
    lineno: anchor.loc.start.line,
    end_lineno: anchor.loc.end.line,
    signature: `${qual}(${params})${returns === null ? "" : `: ${returns}`}`,
    docstring: jsdoc,
    source: slice(sourceText, anchor),
  };
}

/**
 * Build a class node record plus one "method" node per ClassMethod.
 * @param {object} cls Babel ClassDeclaration node.
 * @param {string} moduleName Basename of the module.
 * @param {string} relFile Repo-relative file path.
 * @param {string} sourceText Full file contents.
 * @param {string | null} outerDoc JSDoc found on an outer export wrapper, if any.
 * @returns {object[]} The class node followed by its method nodes.
 */
function makeClass(cls, moduleName, relFile, sourceText, outerDoc = null) {
  const name = cls.id?.name ?? `__anonymous_${cls.loc.start.line}`;
  const out = [
    {
      id: `${moduleName}.${name}`,
      type: "class",
      name,
      file: relFile,
      lineno: cls.loc.start.line,
      end_lineno: cls.loc.end.line,
      signature: name,
      docstring: leadingJSDoc(cls) ?? outerDoc,
      source: slice(sourceText, cls),
    },
  ];
  for (const m of cls.body.body) {
    if (m.type !== "ClassMethod") {
      continue;
    }
    const mName = m.key.name ?? "constructor";
    const params = (m.params ?? []).map((p) => slice(sourceText, p)).join(", ");
    const jsdoc = leadingJSDoc(m);
    const returns = jsdocReturn(jsdoc);
    out.push({
      id: `${moduleName}.${name}.${mName}`,
      type: "method",
      name: mName,
      file: relFile,
      lineno: m.loc.start.line,
      end_lineno: m.loc.end.line,
      signature: `${mName}(${params})${returns === null ? "" : `: ${returns}`}`,
      docstring: jsdoc,
      source: slice(sourceText, m),
    });
  }
  return out;
}

/**
 * Find the nearest leading JSDoc block comment for a node, if any.
 * @param {object} node Babel node with optional leadingComments.
 * @returns {string | null} The raw JSDoc block or null.
 */
function leadingJSDoc(node) {
  const comments = node.leadingComments ?? [];
  for (let i = comments.length - 1; i >= 0; i -= 1) {
    const c = comments[i];
    if (c.type === "CommentBlock" && c.value.trim().startsWith("*")) {
      return `/*${c.value}*/`;
    }
  }
  return null;
}

/**
 * Extract the @returns description from a JSDoc block, if present.
 * @param {string | null} jsdoc Raw JSDoc block.
 * @returns {string | null} The @returns text or null.
 */
function jsdocReturn(jsdoc) {
  if (jsdoc === null) {
    return null;
  }
  const m = jsdoc.match(/@returns?\s+([^\n*]+)/);
  return m === null ? null : m[1].trim();
}

/**
 * Slice the exact source snippet for a node using its start/end offsets.
 * @param {string} sourceText Full file contents.
 * @param {object} node Babel node with start/end offsets.
 * @returns {string} Exact source text.
 */
function slice(sourceText, node) {
  if (typeof node.start === "number" && typeof node.end === "number") {
    return sourceText.slice(node.start, node.end);
  }
  return "";
}

/**
 * Convert an absolute file path to a repo-relative path (forward slashes).
 * The REL root here is the workspace dir, so callers pass a prefix when the
 * spec wants "shop-api/..." — handled by stripping the workspace parent.
 * @param {string} absPath Absolute file path.
 * @param {string} workspaceRoot Absolute workspace root.
 * @returns {string} Relative path like "shop-api/src/checkout.js".
 */
export function toRel(absPath, workspaceRoot) {
  const norm = (p) => p.split("\\").join("/");
  return norm(absPath).replace(norm(workspaceRoot), "").replace(/^\/+/, "");
}

/**
 * Basename of a module without extension (e.g. "checkout" for checkout.js).
 * @param {string} absPath Absolute file path.
 * @returns {string} Module basename.
 */
export function moduleBasename(absPath) {
  const base = absPath.split("/").pop().split("\\").pop();
  return base.replace(/\.(js|jsx)$/, "");
}
