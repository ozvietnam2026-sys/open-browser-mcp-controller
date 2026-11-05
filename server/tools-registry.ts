import { McpToolDefinition } from '../shared/browser-types.js';
import { MCP_BROWSER_TOOLS } from './mcp-browser-tools.js';
import { MCP_EXTRACT_TOOLS, EXTRACT_TOOL_NAMES, executeExtractTool } from './extract/index.js';
import { MCP_PLAYWRIGHT_TOOLS, PLAYWRIGHT_TOOL_NAMES, executePlaywrightTool } from './playwright/tools.js';

/** All MCP tools exposed by this server */
export const ALL_MCP_TOOLS: McpToolDefinition[] = [
  ...MCP_BROWSER_TOOLS,
  ...MCP_EXTRACT_TOOLS,
  ...MCP_PLAYWRIGHT_TOOLS,
];

export async function executeRegisteredTool(name: string, args: Record<string, any>): Promise<any> {
  if (EXTRACT_TOOL_NAMES.has(name)) {
    return executeExtractTool(name, args);
  }
  if (PLAYWRIGHT_TOOL_NAMES.has(name)) {
    return executePlaywrightTool(name, args);
  }
  // browser_* tools stay in McpServerHandler.executeTool
  return null;
}

export { MCP_BROWSER_TOOLS, MCP_EXTRACT_TOOLS, MCP_PLAYWRIGHT_TOOLS };
