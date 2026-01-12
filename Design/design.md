# High Level Design

---

## System Components
*AI generated diagram*
```
┌──────────────────────────────────────────────┐
│           GCP Server (Public IP)             │
│                                              │
│  [Nginx :80] ──► [Tunnel Server :3000]       │
│       │              │                       │
│       │              ├─► [Dashboard API]     │
│       │              │                       │
│       ▼              ▼                       │
│   Routes to      WebSocket                   │
│   players      maintains list                │
│                of connected                  │
│                tunnel clients                │
└──────────────────┬───────────────────────────┘
                   │
                   │ Persistent WebSocket
                   │ (GM initiated, stays open)
                   │
           ┌───────▼────────────────┐
           │   GM's Computer        │
           │                        │
           │  [Tunnel Client]       │
           │         │              │
           │         ▼              │
           │    [Foundry :30000]    │
           └────────────────────────┘
```

---

## Data Flows:
### Player Request Flow:
1. Player browser --> Nginx (:80)
2. Nginx --> Tunnel Server (:3000 locally)
3. Tunnel Server --> WebSocket --> Tunnel Client
4. Tunnel Client --> Foundry (:30000 locally)
5. Response flows backwardds through the same path

### Dashboard Flow:
1. GM browser --> Dashboard wepgage (Served by GCP)
2. Dashboard --> Tunnel Server API (check status)
3. Tunnel Server --> responds with "Client connected: Yes/No"

---

# Low Level Design
## Protocol Design

```json
// 1. CLIENT --> SERVER: Initial connection
{
  "type": "connection_request",
  "data": {
    "auth_token": "your-secret-token"
  }
}

// 2. SERVER --> CLIENT: Connection acknowledged
{
  "type": "connection_response",
  "data": {
    "success": true,
    "message": "Connected successfully"
  }
}

// 3. SERVER --> CLIENT: Forward player HTTP request
{
  "type": "http_request",
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "data": {
    "method": "GET",
    "url": "/join",
    "headers": {
      "Cookie": "session=abc123",
      "User-Agent": "Mozilla/5.0..."
    },
    "body": null  // or string for POST requests
  }
}

// 4. CLIENT --> SERVER: Return Foundry's response
{
  "type": "http_response",
  "id": "550e8400-e29b-41d4-a716-446655440000",  // matches request
  "data": {
    "statusCode": 200,
    "headers": {
      "Content-Type": "text/html",
      "Set-Cookie": "session=xyz789"
    },
    "body": "<html>...</html>"
  }
}

// 5. Keepalive
{
  "type": "ping"
}

{
  "type": "pong"
}

// 6. Error handling
{
  "type": "error",
  "data": {
    "requestId": "uuid-if-applicable",  // optional
    "message": "Detailed error message"
  }
}
```

---

## Implementation Planning

### Tunnel Server Functions
MESSAGE HANDLER: 
```javascript 
Function: handleWebSocketMessage(data)
  Input: data (raw string from WebSocket)
  Output: None (routes to appropriate handler or handles error)
  
  Steps:
  1. let message; 
     try { 
       message = JSON.parse(data); 
     } catch (error) {  
       console.log("WebSocket detected invalid data type: ", error.message); 
       return; 
     }
     
     if (!message.type) { 
       console.error("Message missing 'type' field: ", message); 
       return;
     }
  
  2. const type = message.type;
     
     switch (type) {
       case 'http_request':
         handleHttpRequest(message);
         break;
       case 'http_response':
         handleHttpResponse(message);
         break;
       case 'connection_request':
         handleConnectionRequest(message);
         break;
       case 'ping':
         sendPong();
         break;
       case 'pong':
         updateTimestamp();
         break;
       default:
         console.warn("Unknown message type: ", type);
     }
```

HANDLE PLAYER REQUEST
```javascript
Function: handlePlayerRequest(req, res)
  Input: req (the HTTP request from player), res (the response object to send back to player)
  Output: None (but sends message through WebSocket)
  
  Steps:
  1. generate a UUID for the request
  2. store UUID in the Map with res
  3. encode request into a json
  4. send json through websocket
```

HANDLE HTTP RESPONSE
```javascript
Function: handleHttpResponse(message)
  Input: message (the http_response message from tunnel client)
  Output: None (but sends response to player's browser)
  
  Steps:
  1. deserialize the json
  2. find the UUID from the message data
  3. use the UUID to look up the res object from the Map
  4. extract the response data (statusCode, headers, body) from message.data
  5. send the response to the player's browser using the res object
  6. delete the UUID from the Map (cleanup)
  ```

  ---

### Tunnel Client Functions
MESSAGE HANDLER (same as server, but routes to client handlers)
```javascript
Function: handleWebSocketMessage(data)
  Input: data (raw string from WebSocket)
  Output: None (routes to appropriate handler or handles error)
  
  Steps:
  1. let message; 
     try { 
       message = JSON.parse(data); 
     } catch (error) {  
       console.log("WebSocket detected invalid data type: ", error.message); 
       return; 
     }
     
     if (!message.type) { 
       console.error("Message missing 'type' field: ", message); 
       return;
     }
  
  2. const type = message.type;
     
     switch (type) {
       case 'http_request':
         handleHttpRequest(message);
         break;
       case 'connection_response':
         handleConnectionResponse(message);
         break;
       case 'ping':
         sendPong();
         break;
       case 'pong':
         updateTimestamp();
         break;
       case 'error':
         handleError(message);
         break;
       default:
         console.warn("Unknown message type: ", type);
     }
```

HANDLE HTTP REQUEST
```javascript
Function: handleHttpRequest(message)
  Input: message (the http_request message from tunnel server)
  Output: None (but sends response back through WebSocket)
  
  Steps:
  1. Validate required fields:
     if (!message.id) { 
       console.log("http_request missing ID field"); 
       sendErrorMessage("Missing required field: ID"); 
       return; 
     }
     if (!message.data) { 
       console.log("http_request missing field DATA"); 
       sendErrorMessage("Missing required field: DATA"); 
       return; 
     }
     if (!message.data.method || !message.data.url || !message.data.headers) { 
       console.log("http_request missing fields in data"); 
       sendErrorMessage("Missing required fields in data"); 
       return; 
     }
  
  2. deserialize the http request from json
  3. retrieve the UUID from the message
  4. send the http request to foundry using fetch
  5. receive the response from foundry
  6. extract data from foundryResponse:
     const statusCode = foundryResponse.status;
     const headers = {};
     foundryResponse.headers.forEach((value, key) => {
       headers[key] = value;
     });
     const body = await foundryResponse.text();
  7. attach the same UUID to the response
  8. serialize the http response into json
  9. send the json through the websocket to the server
  ```

---

### File structure *given by AI*
```
foundry-tunnel/
├── server/                      # Runs on GCP
│   ├── index.js                 # Main entry point
│   ├── tunnelServer.js          # WebSocket tunnel server logic
│   ├── httpProxy.js             # Handles incoming player HTTP requests
│   ├── config.js                # Configuration (auth token, ports, etc.)
│   └── package.json
│
├── client/                      # Runs on GM's computer
│   ├── index.js                 # Main entry point
│   ├── tunnelClient.js          # WebSocket tunnel client logic
│   ├── foundryProxy.js          # Makes requests to Foundry
│   ├── config.js                # Configuration (GCP IP, auth token, etc.)
│   └── package.json
│
├── dashboard/                   # Web UI (served by server)
│   ├── index.html               # Dashboard page
│   ├── style.css                # Styling
│   └── app.js                   # Frontend JavaScript
│
└── shared/
    └── protocol.js              # Shared message types/constants
```

---

#### What Goes in Each File:
**Server Files:**
`server/index.js` - Main entry point
```javascript
// - Start Express server
// - Serve dashboard static files
// - Initialize tunnel server
// - Set up HTTP proxy
```
`server/tunnelServer.js` - WebSocket logic
```javascript
// - Accept WebSocket connections from tunnel client
// - Handle authentication (connection_request)
// - Store connected client
// - Handle http_response messages
// - Send http_request messages
// - Ping/pong keepalive
```
`server/httpProxy.js` - Player request handling
```javascript
// - Express middleware to capture player requests
// - Generate UUIDs
// - Store pending requests in Map
// - Forward to tunnel client
// - Return responses to players
```
`server/config.js` - Configuration
```javascript
// - PORT (80)
// - AUTH_TOKEN (shared secret)
// - Any other config
```

---

**Client Files:**
`client/index.js` - Main entry point
```javascript
// - Load config
// - Initialize tunnel client
// - Connect to server
// - Handle reconnection
```
`client/tunnelClient.js` - WebSocket logic
```javascript
// - Connect to server WebSocket
// - Send connection_request with auth token
// - Handle http_request messages
// - Send http_response messages back
// - Auto-reconnect on disconnect
// - Ping/pong keepalive
```
`client/foundryProxy.js` - Foundry communication
```javascript
// - Make fetch requests to localhost:30000
// - Extract status, headers, body
// - Handle errors (Foundry not running, etc.)
```
`client/config.js` - Configuration
```javascript
// - SERVER_URL (ws://136.118.150.14:3000)
// - AUTH_TOKEN (matches server)
// - FOUNDRY_URL (http://localhost:30000)
```

---

**Dashboard Files:**
`dashboard/index.html` - Simple status page
```html
<!-- 
- Show tunnel status (Connected/Disconnected)
- Show uptime
- Maybe show number of connected players
- Simple, clean design
-->
```
`dashboard/app.js` - Fetch status from API
```javascript
// - Poll /api/status endpoint
// - Update UI with connection status
```

---

**Shared Files:**
`shared/protocol.js` - Message type constants
```javascript
// Export message type constants so both client and server use same strings
export const MESSAGE_TYPES = {
  CONNECTION_REQUEST: 'connection_request',
  CONNECTION_RESPONSE: 'connection_response',
  HTTP_REQUEST: 'http_request',
  HTTP_RESPONSE: 'http_response',
  PING: 'ping',
  PONG: 'pong',
  ERROR: 'error'
};
```

---
### Implementation Phases
**Phase 1:** Get Basic Tunnel Working (Core)

`shared/protocol.js` - Define your message types
`server/tunnelServer.js` - Basic WebSocket server
`client/tunnelClient.js` - Basic WebSocket client
Test: Can client connect to server?

**Phase 2:** Add HTTP Proxying

`server/httpProxy.js` - Capture player requests
`client/foundryProxy.js` - Forward to Foundry
Connect the pieces in `server/index.js` and `client/index.js`
Test: Can a player request flow through the tunnel?

**Phase 3:** Add Dashboard (Polish)

`dashboard/index.html` - Simple status page
`dashboard/app.js` - Fetch status
Add API endpoint in `server/index.js`
