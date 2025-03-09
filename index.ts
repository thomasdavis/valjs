import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import fetch from "node-fetch";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const server = new Server(
  {
    name: "valtown-mcp-alpha",
    version: "1.0.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
      logging: {},
    },
  }
);


interface ValTownResponse {
  tools?: Tool[];
}

interface ValTownExecuteResponse {
  result: any;
  error?: string;
}

/**
 * Format the ValTown response
 * @param response The raw response from ValTown
 * @param server The MCP server instance for logging
 * @returns The ValTown response
 */
async function formatValTownResponse(response: ValTownExecuteResponse, server: Server): Promise<any> {
  server.sendLoggingMessage({
    level: "info",
    data: `ValTown response: ${JSON.stringify(response)}`
  });
  return response;
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  // Log that we received a ListTools request
  server.sendLoggingMessage({
    level: "info",
    data: "Received ListTools request",
  });

  const response = await fetch("https://ajax-mcp.web.val.run", {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  });
  const valtownTools = await response.json();
  server.sendLoggingMessage({
    level: "info",
    data: `ListTools response received: ${JSON.stringify(valtownTools)}`
  });

  // Return the tools from ValTown API
  return {
    tools: valtownTools || []
  };
});



server.setRequestHandler(CallToolRequestSchema, async (request) => {
  console.error("Forwarding tool request to Val Town:", request.params.name, request.params.arguments);
  
  // Log the incoming tool call request with detailed information
  server.sendLoggingMessage({
    level: "info",
    data: `Tool call request received: name='${request.params.name}', arguments=${JSON.stringify(request.params.arguments)}`
  });

  try {
    // Construct the URL for the Val Town tool
    const toolUrl = `https://ajax-${request.params.name}.web.val.run`;
    
    server.sendLoggingMessage({
      level: "info",
      data: `Attempting to fetch from URL: ${toolUrl}`
    });
    
    // Make the API request and await the response
    const response = await fetch(toolUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request.params.arguments || {})
    });
    
    server.sendLoggingMessage({
      level: "info",
      data: `Response status: ${response.status} ${response.statusText}`
    });

    // Handle non-OK responses
    if (!response.ok) {
      if (response.status === 404) {
        return {
          message: `Tool '${request.params.name}' was not found`,
          error: "NOT_FOUND"
        };
      }
      return {
        message: `Val Town API error: ${response.statusText}`,
        error: "API_ERROR"
      };
    }

    // Parse the JSON response
    const valTownResponse = await response.json();
    server.sendLoggingMessage({
      level: "info",
      data: `Response parsed: ${JSON.stringify(valTownResponse)}`
    });
    
    // Call our formatter function to prepare the response
    const formattedResponse = await formatValTownResponse(valTownResponse as ValTownExecuteResponse, server);
    
    // Return the enhanced response
    return formattedResponse;
    
  } catch (error: unknown) {
    // Handle all errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    server.sendLoggingMessage({
      level: "error",
      data: `Error executing tool: ${errorMessage}`
    });
    return {
      message: `Tool execution failed`,
      error: errorMessage
    };
  }

});

server.onerror = (error: any) => {
  console.error(error);
};

process.on("SIGINT", async () => {
  await server.close();
  process.exit(0);
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("valtown MCP Server running on stdio");
  
  // Log server startup
  server.sendLoggingMessage({
    level: "info",
    data: "Server started successfully",
  });
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
