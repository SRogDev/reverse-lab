/**
 * Reverse Lab MCP server (stdio).
 *
 * Entry point: `npm run mcp:server`.
 *
 * Registers the 7 tools from ./tools (verified against
 * @modelcontextprotocol/sdk 1.32.1: `McpServer.registerTool` with zod
 * input/output schemas, `StdioServerTransport`). Input validation and
 * structured-output validation are performed by the SDK itself; tool errors
 * surface as MCP `isError` results, never as protocol crashes.
 *
 * Trust boundary: stdio = local machine. See docs/architecture/mcp-auth.md.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getStore } from "../lib/store.ts";
import { ToolError, toolDefinitions } from "./tools.ts";

export const SERVER_NAME = "reverse-lab";
export const SERVER_VERSION = "0.1.0";

export function buildServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });
  for (const tool of toolDefinitions) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
      },
      async (args) => {
        try {
          const output = await tool.execute(getStore(), args);
          const text = JSON.stringify(output, null, 2);
          return {
            content: [{ type: "text" as const, text }],
            structuredContent: output as Record<string, unknown>,
          };
        } catch (err) {
          const message =
            err instanceof ToolError
              ? `[${err.code}] ${err.message}`
              : err instanceof Error
                ? err.message
                : String(err);
          return {
            content: [{ type: "text" as const, text: `Error: ${message}` }],
            isError: true,
          };
        }
      },
    );
  }
  return server;
}

async function main(): Promise<void> {
  const server = buildServer();
  await server.connect(new StdioServerTransport());
  // The transport owns stdin/stdout from here; the process lives until the
  // client closes the pipe. Errors go to stderr, never to stdout.
  process.on("unhandledRejection", (err) => {
    console.error("unhandled rejection:", err);
    process.exit(1);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
