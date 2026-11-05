#!/usr/bin/env npx tsx
/**
 * MCP stdio transport (GitHub MCP / Playwright MCP style).
 * Usage: npm run mcp:stdio
 * Speaks JSON-RPC over stdin/stdout for local MCP clients.
 */
import { McpServerHandler } from '../server/mcp-server.js';

async function readMessage(): Promise<any | null> {
  const chunks: Buffer[] = [];
  let contentLength: number | null = null;
  let buffer = Buffer.alloc(0);

  return new Promise((resolve, reject) => {
    const onData = (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (true) {
        if (contentLength == null) {
          const headerEnd = buffer.indexOf('\r\n\r\n');
          if (headerEnd === -1) return;
          const header = buffer.subarray(0, headerEnd).toString('utf8');
          const match = /Content-Length:\s*(\d+)/i.exec(header);
          if (!match) {
            reject(new Error('Missing Content-Length'));
            return;
          }
          contentLength = parseInt(match[1], 10);
          buffer = buffer.subarray(headerEnd + 4);
        }
        if (buffer.length >= contentLength) {
          const body = buffer.subarray(0, contentLength).toString('utf8');
          buffer = buffer.subarray(contentLength);
          contentLength = null;
          process.stdin.off('data', onData);
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
          return;
        } else {
          return;
        }
      }
    };
    process.stdin.on('data', onData);
    process.stdin.on('end', () => resolve(null));
    process.stdin.on('error', reject);
  });
}

function writeMessage(msg: any) {
  if (msg == null) return;
  // Skip empty notification responses without id
  if (msg.id === null && msg.result && Object.keys(msg.result).length === 0 && !msg.error) {
    // still fine to skip pure acks
  }
  const body = Buffer.from(JSON.stringify(msg), 'utf8');
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}

async function main() {
  process.stdin.resume();
  for (;;) {
    const msg = await readMessage();
    if (msg == null) break;
    const response = await McpServerHandler.processRpcMessage(msg);
    if (msg.id !== undefined && msg.id !== null) {
      writeMessage(response);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
