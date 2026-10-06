/**
 * Best-effort parse of a JSON object that is still streaming in, e.g.
 *   {"severities":["error"],"sources":["chec
 * Closes any open string, array and object, drops a trailing partial
 * key or comma, and tries JSON.parse. Used ONLY for the live preview; the
 * filter that gets applied always comes from the server's validated result.
 */
export function parsePartialJson(text: string): unknown {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") stack.pop();
  }

  let candidate = text;
  if (inString) candidate += '"';
  // Try progressively shorter prefixes: a half-written key like `"sinceMi`
  // can't be completed, but everything before it can.
  for (let cut = candidate.length; cut > 0; cut--) {
    const head = candidate.slice(0, cut).replace(/[,:\s]+$/, "");
    const closers = closersFor(head);
    try {
      return JSON.parse(head + closers);
    } catch {
      // keep trimming
    }
  }
  return null;
}

function closersFor(text: string): string {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") stack.pop();
  }
  return (inString ? '"' : "") + stack.reverse().join("");
}
