export function sendAIError(res, err, fallbackCode = "AI_FAILED") {
  const status = err.name === "ZodError" || err.code === "AI_INVALID_REQUEST" ? 400
    : err.code === "AI_CONTEXT_TOO_LARGE" ? 413
      : err.code === "AI_QUOTA_EXHAUSTED" ? 429
        : err.code === "AI_TIMEOUT" ? 504
          : err.code === "AI_INVALID_RESPONSE" ? 502
            : err.code?.startsWith("AI_") ? 503
              : err.code === "PATCH_CONFLICT" ? 409
                : err.code === "PROPOSAL_NOT_FOUND" ? 404
                  : 500;
  res.status(status).json({
    error: { code: err.code ?? fallbackCode, message: err.message },
  });
}
