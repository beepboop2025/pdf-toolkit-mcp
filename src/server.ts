import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerReadTools } from './tools/read.js';
import { registerCreateTools } from './tools/create.js';
import { registerManipulateTools } from './tools/manipulate.js';
import { registerOverlayTools } from './tools/overlay.js';
import { registerAnnotateTools } from './tools/annotate.js';
import { registerFormTools } from './tools/forms.js';
import { registerMetadataTools } from './tools/metadata.js';
import { registerSecurityTools } from './tools/security.js';

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'pdf-toolkit-mcp',
    version: '2.0.0',
  });

  registerReadTools(server);
  registerCreateTools(server);
  registerManipulateTools(server);
  registerOverlayTools(server);
  registerAnnotateTools(server);
  registerFormTools(server);
  registerMetadataTools(server);
  registerSecurityTools(server);

  return server;
}
