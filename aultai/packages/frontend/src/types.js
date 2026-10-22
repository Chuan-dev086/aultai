/**
 * @typedef {Object} Node
 * @property {string} id
 * @property {string} type
 * @property {string} [name]
 * @property {string} [file]
 * @property {number} [lineno]
 * @property {number} [end_lineno]
 * @property {string} [signature]
 * @property {string | null} [docstring]
 * @property {string} [source]
 * @property {number} [depth]
 */

/**
 * @typedef {Object} Edge
 * @property {string} source
 * @property {string} target
 * @property {string} type
 */

/**
 * @typedef {Object} ProjectFile
 * @property {string} path
 * @property {number} node_count
 */

/**
 * @typedef {Object} ProjectInfo
 * @property {ProjectFile[]} files
 * @property {number} node_count
 * @property {number} edge_count
 */

/**
 * @typedef {Object} GraphData
 * @property {Node[]} nodes
 * @property {Edge[]} edges
 */

/**
 * @typedef {Node & { callers: string[], callees: string[] }} NodeDetail
 */

export {};
