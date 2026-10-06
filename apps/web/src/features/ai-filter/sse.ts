/**
 * Incremental parser for text/event-stream. Network chunks can split a
 * message anywhere (even mid-JSON), so text is buffered until a blank line
 * ends an event. Only `data:` lines are used.
 *
 * (EventSource can't be used here: it only does GET and can't send an
 * Authorization header.)
 */
export function createSseParser(onData: (data: string) => void) {
  let buffer = "";
  return {
    feed(chunk: string) {
      // Normalise on the whole buffer: a "\r\n" can be split across two chunks.
      buffer = (buffer + chunk).replace(/\r\n/g, "\n");
      let end: number;
      while ((end = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = block
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).replace(/^ /, ""))
          .join("\n");
        if (data) onData(data);
      }
    },
  };
}
