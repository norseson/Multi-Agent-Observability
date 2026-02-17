interface RedactionConfig {
  maxStdoutBytes: number;
  maxStderrBytes: number;
  secretPatterns: RegExp[];
}

const DEFAULT_CONFIG: RedactionConfig = {
  maxStdoutBytes: 4096,  // 4KB
  maxStderrBytes: 2048,  // 2KB
  secretPatterns: [
    // API keys (common formats - 32+ alphanumeric/dash)
    /\b[A-Za-z0-9_-]{32,}\b/g,
    // Bearer tokens
    /Authorization:\s*Bearer\s+[A-Za-z0-9_\-\.]+/gi,
    // Basic auth
    /Authorization:\s*Basic\s+[A-Za-z0-9+\/=]+/gi,
    // AWS keys
    /AKIA[0-9A-Z]{16}/g,
    // GitHub tokens
    /gh[pousr]_[A-Za-z0-9_]{36,}/g,
    // Generic base64-ish secrets (long strings)
    /[A-Za-z0-9+\/]{40,}={0,2}/g,
    // .env KEY=VALUE patterns
    /([A-Z_]+)=([^\s]+)/g  // Will replace value only
  ]
};

/**
 * Redact secrets from a string value
 */
function redactSecrets(text: string, patterns: RegExp[]): string {
  let redacted = text;

  for (const pattern of patterns) {
    if (pattern.source.includes('([A-Z_]+)=([^\\s]+)')) {
      // Special case: preserve KEY= but redact value
      redacted = redacted.replace(pattern, '$1=***REDACTED***');
    } else {
      redacted = redacted.replace(pattern, '***REDACTED***');
    }
  }

  return redacted;
}

/**
 * Truncate output streams to prevent payload bloat
 */
function truncateOutput(text: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);

  if (bytes.length <= maxBytes) return text;

  const truncated = new TextDecoder().decode(bytes.slice(0, maxBytes));
  return truncated + `\n... [truncated ${bytes.length - maxBytes} bytes]`;
}

/**
 * Recursively redact secrets in payload object
 */
function redactPayloadRecursive(
  obj: unknown,
  config: RedactionConfig,
  path = ''
): unknown {
  if (typeof obj === 'string') {
    // Check if this is stdout/stderr based on path
    if (path.includes('stdout')) {
      return truncateOutput(redactSecrets(obj, config.secretPatterns), config.maxStdoutBytes);
    }
    if (path.includes('stderr')) {
      return truncateOutput(redactSecrets(obj, config.secretPatterns), config.maxStderrBytes);
    }
    return redactSecrets(obj, config.secretPatterns);
  }

  if (Array.isArray(obj)) {
    return obj.map((item, i) => redactPayloadRecursive(item, config, `${path}[${i}]`));
  }

  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = redactPayloadRecursive(value, config, `${path}.${key}`);
    }
    return result;
  }

  return obj;
}

/**
 * Main redaction function - apply before DB insert
 */
export function redactPayload(
  payload: Record<string, unknown>,
  config: RedactionConfig = DEFAULT_CONFIG
): Record<string, unknown> {
  return redactPayloadRecursive(payload, config, 'root') as Record<string, unknown>;
}
