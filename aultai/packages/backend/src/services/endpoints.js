import path from "node:path";
import traverse from "@babel/traverse";
import * as babelParser from "@babel/parser";
import { getActiveSubdir, listJsFiles, readFile } from "./sandbox.js";

const walk = traverse.default ?? traverse;
const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "options", "head", "all"]);
const EXTENSIONS = [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts"];

/**
 * Statically discover Express-style route declarations in the active project.
 * @returns {Promise<Array<{ method: string, path: string, file: string, line: number }>>}
 */
export async function discoverEndpoints() {
  const active = getActiveSubdir();
  const files = await listJsFiles(active);
  const modules = new Map();
  const endpoints = [];

  for (const file of files) {
    let source;
    try {
      source = await readFile(file);
    } catch (error) {
      if (error.code === "ENOENT") {
        continue;
      }
      throw error;
    }
    let ast;
    try {
      ast = babelParser.parse(source, {
        sourceType: "unambiguous",
        plugins: ["jsx", "classProperties"],
      });
    } catch {
      continue;
    }

    const moduleId = moduleIdFromFile(file, active);
    const relativeFile = file.slice(`${active}/`.length);
    const imports = new Map();
    const exportedRouters = new Set();
    const routerVariables = new Set();
    const appVariables = new Set();
    const mounts = [];
    const routes = [];

    walk(ast, {
      ImportDeclaration(p) {
        const importedModule = resolveImport(p.node.source.value, relativeFile, files, active);
        if (importedModule === null) {
          return;
        }
        for (const specifier of p.node.specifiers) {
          imports.set(specifier.local.name, importedModule);
        }
      },
      VariableDeclarator(p) {
        if (p.node.id.type !== "Identifier" || p.node.init?.type !== "CallExpression") {
          return;
        }
        const name = p.node.id.name;
        const callee = p.node.init.callee;
        const calleeName = callee.type === "Identifier"
          ? callee.name
          : callee.type === "MemberExpression" && callee.property.type === "Identifier"
            ? callee.property.name
            : "";
        if (calleeName === "Router") {
          routerVariables.add(name);
        } else if (calleeName === "express") {
          appVariables.add(name);
        }
      },
      ExportNamedDeclaration(p) {
        const declaration = p.node.declaration;
        if (declaration?.type !== "VariableDeclaration") {
          return;
        }
        for (const item of declaration.declarations) {
          if (item.id.type === "Identifier" && item.init?.type === "CallExpression") {
            const callee = item.init.callee;
            if (
              callee.type === "Identifier" && callee.name === "Router" ||
              callee.type === "MemberExpression" && callee.property.type === "Identifier" && callee.property.name === "Router"
            ) {
              exportedRouters.add(item.id.name);
            }
          }
        }
      },
      CallExpression(p) {
        const callee = p.node.callee;
        if (callee.type !== "MemberExpression" || callee.computed || callee.property.type !== "Identifier") {
          return;
        }
        const method = callee.property.name.toLowerCase();
        const receiver = callee.object;
        if (method === "use" && receiver.type === "Identifier") {
          const args = p.node.arguments;
          const prefix = args[0]?.type === "StringLiteral" ? args[0].value : "";
          for (const arg of args.slice(args[0]?.type === "StringLiteral" ? 1 : 0)) {
            if (arg.type === "Identifier") {
              mounts.push({ receiver: arg.name, prefix, imports });
            }
          }
        }
        if (!HTTP_METHODS.has(method)) {
          return;
        }
        let routePath = null;
        if (receiver.type === "Identifier") {
          routePath = literalPath(p.node.arguments[0]);
        } else if (receiver.type === "CallExpression" &&
                   receiver.callee.type === "MemberExpression" &&
                   receiver.callee.property.type === "Identifier" &&
                   receiver.callee.property.name === "route") {
          routePath = literalPath(receiver.arguments[0]);
        }
        if (routePath === null) {
          return;
        }
        const receiverId = receiver.type === "Identifier" ? receiver.name : null;
        if (receiverId !== null && !routerVariables.has(receiverId) && !appVariables.has(receiverId)) {
          return;
        }
        routes.push({
          method: method === "all" ? "ALL" : method.toUpperCase(),
          path: routePath,
          file,
          line: p.node.loc.start.line,
          router: receiverId,
          isApp: receiverId !== null && appVariables.has(receiverId),
        });
      },
    });

    modules.set(moduleId, { imports, exportedRouters, mounts });
    endpoints.push(...routes);
  }

  const routeModuleByFile = new Map(files.map((file) => [file, moduleIdFromFile(file, active)]));
  const expanded = [];
  for (const route of endpoints) {
    if (route.isApp || route.router === null) {
      expanded.push({ ...route, path: normalizePath(route.path) });
      continue;
    }
    const routeModule = routeModuleByFile.get(route.file);
    const prefixes = [];
    for (const [mountFile, mountModuleId] of routeModuleByFile) {
      const mountModule = modules.get(mountModuleId);
      if (mountModule === undefined) {
        continue;
      }
      for (const mount of mountModule.mounts) {
        if (
          mountModuleId === routeModule &&
          mount.receiver === route.router
        ) {
          prefixes.push(mount.prefix);
          continue;
        }
        const importedModule = mount.imports.get(mount.receiver);
        const importedInfo = importedModule === undefined ? undefined : modules.get(importedModule);
        if (
          importedModule === routeModule &&
          importedInfo?.exportedRouters.has(route.router)
        ) {
          prefixes.push(mount.prefix);
        }
      }
    }
    const resolvedPrefixes = prefixes.length === 0 ? [""] : [...new Set(prefixes)];
    for (const prefix of resolvedPrefixes) {
      expanded.push({ ...route, path: joinPaths(prefix, route.path) });
    }
  }

  const unique = new Map();
  for (const endpoint of expanded) {
    const key = `${endpoint.method}\u0000${endpoint.path}\u0000${endpoint.file}\u0000${endpoint.line}`;
    unique.set(key, {
      method: endpoint.method,
      path: endpoint.path,
      file: endpoint.file,
      line: endpoint.line,
    });
  }
  return [...unique.values()].sort((a, b) =>
    a.path.localeCompare(b.path) || a.method.localeCompare(b.method) || a.file.localeCompare(b.file),
  );
}

function literalPath(node) {
  if (node?.type === "StringLiteral") {
    return node.value;
  }
  if (node?.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? null;
  }
  return null;
}

function moduleIdFromFile(file, active) {
  return file.slice(`${active}/`.length).replace(/\.(?:[cm]?[jt]sx?)$/i, "");
}

function resolveImport(specifier, importer, files, active) {
  if (!specifier.startsWith(".")) {
    return null;
  }
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(importer), specifier));
  const candidates = path.posix.extname(base)
    ? [base, ...EXTENSIONS.map((extension) => base.replace(/\.(?:[cm]?[jt]sx?)$/i, extension))]
    : [...EXTENSIONS.map((extension) => `${base}${extension}`), ...EXTENSIONS.map((extension) => `${base}/index${extension}`)];
  const file = candidates.find((candidate) => files.includes(`${active}/${candidate}`));
  return file === undefined ? null : moduleIdFromFile(`${active}/${file}`, active);
}

function normalizePath(value) {
  const prefixed = value.startsWith("/") ? value : `/${value}`;
  return prefixed.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

function joinPaths(prefix, routePath) {
  return normalizePath(`${prefix}/${routePath}`);
}
