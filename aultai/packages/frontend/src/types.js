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

/**
 * @typedef {Object} Issue
 * @property {string} id
 * @property {string} title
 * @property {"low" | "medium" | "high"} severity
 * @property {string} node_id
 * @property {string} file
 * @property {number} lineno
 * @property {string} evidence
 * @property {string} explanation
 * @property {string} suggested_action
 */

/**
 * @typedef {Object} AnalyzeResponse
 * @property {Issue[]} issues
 * @property {"live" | "mock"} mode
 */

/**
 * @typedef {Object} FixProposal
 * @property {string} id
 * @property {string} issueId
 * @property {string} file
 * @property {string} originalCode
 * @property {string} proposedCode
 * @property {string} unifiedDiff
 * @property {string} explanation
 * @property {string[]} rationaleSteps
 * @property {string[]} impactedNodes
 * @property {"low" | "medium" | "high"} risk
 */

/**
 * @typedef {Object} GeneratedTestCase
 * @property {string} name
 * @property {string} code
 */

/**
 * @typedef {Object} GenerateTestsResponse
 * @property {GeneratedTestCase[]} tests
 */

/**
 * @typedef {Object} SingleTestResult
 * @property {string} name
 * @property {"passed" | "failed"} status
 * @property {number} duration_ms
 * @property {string | null} error
 */

/**
 * @typedef {Object} TestRunResult
 * @property {number} total
 * @property {number} passed
 * @property {number} failed
 * @property {number} duration_ms
 * @property {SingleTestResult[]} tests
 */

export {};
