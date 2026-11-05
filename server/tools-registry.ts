import { McpToolDefinition } from '../shared/browser-types.js';
import { MCP_BROWSER_TOOLS } from './mcp-browser-tools.js';
import { MCP_EXTRACT_TOOLS, EXTRACT_TOOL_NAMES, executeExtractTool } from './extract/index.js';
import { MCP_PLAYWRIGHT_TOOLS, PLAYWRIGHT_TOOL_NAMES, executePlaywrightTool } from './playwright/tools.js';
import { MCP_MAIL_TOOLS, MAIL_TOOL_NAMES, executeMailTool } from './mailbox/index.js';
import { MCP_AI_WEB_TOOLS, AI_WEB_TOOL_NAMES, executeAiWebTool } from './ai-web/index.js';
import { MCP_META_TOOLS, META_TOOL_NAMES, executeMetaTool } from './meta/index.js';
import { filterToolsByCaps } from './config.js';

/** Full unfiltered catalog */
export const ALL_MCP_TOOLS_RAW: McpToolDefinition[] = [
  ...MCP_BROWSER_TOOLS,
  ...MCP_EXTRACT_TOOLS,
  ...MCP_PLAYWRIGHT_TOOLS,
  ...MCP_MAIL_TOOLS,
  ...MCP_AI_WEB_TOOLS,
  ...MCP_META_TOOLS,
];

/** Filtered by profile / caps / exclude (github-mcp + playwright-mcp style) */
export function getVisibleTools(): McpToolDefinition[] {
  return filterToolsByCaps(ALL_MCP_TOOLS_RAW);
}

/** Alias used by MCP list_tools — filtered */
export const ALL_MCP_TOOLS: McpToolDefinition[] = ALL_MCP_TOOLS_RAW;

export async function executeRegisteredTool(name: string, args: Record<string, any>): Promise<any> {
  if (META_TOOL_NAMES.has(name)) {
    return executeMetaTool(name, args);
  }
  if (EXTRACT_TOOL_NAMES.has(name)) {
    return executeExtractTool(name, args);
  }
  if (PLAYWRIGHT_TOOL_NAMES.has(name)) {
    return executePlaywrightTool(name, args);
  }
  if (MAIL_TOOL_NAMES.has(name)) {
    return executeMailTool(name, args);
  }
  if (AI_WEB_TOOL_NAMES.has(name)) {
    return executeAiWebTool(name, args);
  }
  // browser_* tools stay in McpServerHandler.executeTool
  return null;
}

export {
  MCP_BROWSER_TOOLS,
  MCP_EXTRACT_TOOLS,
  MCP_PLAYWRIGHT_TOOLS,
  MCP_MAIL_TOOLS,
  MCP_AI_WEB_TOOLS,
  MCP_META_TOOLS,
};
