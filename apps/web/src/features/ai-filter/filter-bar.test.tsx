import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { makeSession, renderWithProviders, signIn } from "@/test/utils";
import { FilterBar } from "./filter-bar";
import { useFilterStore } from "./store";

const ACME = makeSession("viewer").tenant.id;

/** A fetch Response whose SSE body we push into by hand, so the test controls timing. */
function streamingResponse() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start: (c) => void (controller = c) });
  const enc = new TextEncoder();
  return {
    response: new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }),
    send: (msg: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(msg)}\n\n`)),
    close: () => controller.close(),
  };
}

beforeEach(() => {
  signIn(makeSession("viewer"));
  useFilterStore.setState({ byTenant: {} });
  vi.spyOn(api, "aiStatus").mockResolvedValue({ mode: "ai", model: "claude-haiku-4-5" });
});
afterEach(() => vi.restoreAllMocks());

describe("FilterBar", () => {
  it("previews the filter while it streams, then applies the server's validated result", async () => {
    const user = userEvent.setup();
    const stream = streamingResponse();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(stream.response);
    renderWithProviders(<FilterBar />);

    await user.type(screen.getByRole("searchbox", { name: /plain english/i }), "errors from checkout in the last hour{Enter}");

    // Only the query goes to OUR server (never straight to the LLM), with the user's token.
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toMatch(/\/api\/ai\/filter$/);
    expect(init?.body).toBe(JSON.stringify({ query: "errors from checkout in the last hour" }));
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-token-acme-viewer");

    // Half an answer: chips appear from the partial JSON.
    stream.send({ type: "delta", text: '{"severities":["error"],"sources":["check' });
    expect(await screen.findByText("Errors")).toBeInTheDocument();
    expect(screen.getByText("from check")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filtering" })).toBeDisabled();

    // The model claimed "60" but the server's final result is what counts.
    stream.send({ type: "delta", text: 'out"],"sinceMinutes":60}' });
    stream.send({
      type: "result",
      source: "ai",
      notes: [],
      filter: { severities: ["error"], eventTypes: [], sources: ["checkout"], sinceMinutes: 60 },
    });
    stream.close();

    expect(await screen.findByText("Errors from checkout in the last hour")).toBeInTheDocument();
    expect(screen.getByText("via AI")).toBeInTheDocument();
    expect(useFilterStore.getState().byTenant[ACME]?.filter.sources).toEqual(["checkout"]);
  });

  it("lets a chip be removed and the whole filter be cleared", async () => {
    const user = userEvent.setup();
    useFilterStore.getState().apply(ACME, {
      query: "errors from checkout",
      source: "rules",
      notes: ["Matched by keywords."],
      filter: { severities: ["error"], eventTypes: [], sources: ["checkout"], sinceMinutes: null },
    });
    renderWithProviders(<FilterBar />);

    expect(screen.getByText("via keywords")).toBeInTheDocument();
    expect(screen.getByText("Matched by keywords.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove from checkout" }));
    expect(useFilterStore.getState().byTenant[ACME]?.filter.sources).toEqual([]);
    // The chip animates out (exit animation), then leaves the DOM.
    await waitFor(() => expect(screen.queryByText("from checkout")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Clear filter" }));
    expect(useFilterStore.getState().byTenant[ACME]).toBeUndefined();
  });

  it("shows the server's error message (for example, rate limited)", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "TOO_MANY_REQUESTS", message: "Too many filter requests. Try again in a minute." } }), {
        status: 429,
        headers: { "content-type": "application/json" },
      }),
    );
    renderWithProviders(<FilterBar />);
    await user.type(screen.getByRole("searchbox", { name: /plain english/i }), "warnings today{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many filter requests");
  });

  it("leaves the dashboard alone when nothing in the request matched", async () => {
    const user = userEvent.setup();
    const stream = streamingResponse();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(stream.response);
    renderWithProviders(<FilterBar />);
    await user.type(screen.getByRole("searchbox", { name: /plain english/i }), "show me the good stuff{Enter}");
    stream.send({
      type: "result",
      source: "rules",
      notes: ["Couldn't find an event type, source, severity or time range in that."],
      filter: { severities: [], eventTypes: [], sources: [], sinceMinutes: null },
    });
    stream.close();
    expect(await screen.findByText(/Couldn't find an event type/)).toBeInTheDocument();
    expect(screen.queryByText("Showing")).not.toBeInTheDocument();
    expect(useFilterStore.getState().byTenant[ACME]).toBeUndefined();
  });

  it("does not submit fewer than two characters", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    renderWithProviders(<FilterBar />);
    await user.type(screen.getByRole("searchbox", { name: /plain english/i }), "e{Enter}");
    await waitFor(() => expect(screen.getByRole("button", { name: "Filter" })).toBeDisabled());
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
