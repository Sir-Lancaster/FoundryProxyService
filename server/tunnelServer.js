const { Server } = require('socket.io');
const { WEBSOCKET_PORT, AUTH_TOKEN } = require('./config');
const { MESSAGE_TYPES } = require('../shared/protocol');
const { pendingRequests } = require('./pendingRequests');

const io = new Server(WEBSOCKET_PORT, {
    cors: { origin: '*' }
});

let connectedClient = null;

// Store active WebSocket connections (upgrade socket -> id mapping)
const activeWebSockets = new Map();

function sendToClient(message) {
    if (connectedClient) {
        connectedClient.emit('message', message);
        return true;
    }
    return false;
}

io.on('connection', (socket) => {
    console.log(`Client attempting to connect: ${socket.id}`);
    
    // Wait for auth
    socket.on('auth', (token) => {
        if (token === AUTH_TOKEN) {
            console.log('Client authenticated successfully');
            connectedClient = socket;
            socket.emit('message', { type: MESSAGE_TYPES.AUTH_SUCCESS });
        } else {
            console.log('Client authentication failed');
            socket.emit('message', { type: MESSAGE_TYPES.AUTH_FAILURE });
            socket.disconnect();
        }
    });
    
    socket.on('message', (message) => {
        if (socket !== connectedClient) return;
        
        switch (message.type) {
            case MESSAGE_TYPES.HTTP_RESPONSE:
                handleHttpResponse(message);
                break;
            case MESSAGE_TYPES.WS_UPGRADE_SUCCESS:
                handleWsUpgradeSuccess(message);
                break;
            case MESSAGE_TYPES.WS_UPGRADE_FAILURE:
                handleWsUpgradeFailure(message);
                break;
            case MESSAGE_TYPES.WS_DATA:
                handleWsData(message);
                break;
            case MESSAGE_TYPES.WS_CLOSE:
                handleWsClose(message);
                break;
        }
    });
    
    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
        if (socket === connectedClient) {
            connectedClient = null;
            // Close all active WebSocket connections
            const { pendingUpgrades } = require('./httpProxy');
            for (const [id, { socket: wsSocket }] of pendingUpgrades) {
                wsSocket.destroy();
            }
            pendingUpgrades.clear();
            activeWebSockets.clear();
        }
    });
});

function handleHttpResponse(message) {
    const res = pendingRequests.get(message.id);
    if (!res) return;
    
    pendingRequests.delete(message.id);
    
    const { statusCode, headers, body, encoding } = message.data;
    
    // Set headers
    Object.entries(headers || {}).forEach(([key, value]) => {
        // Skip problematic headers
        if (key.toLowerCase() !== 'transfer-encoding') {
            res.setHeader(key, value);
        }
    });
    
    res.status(statusCode);
    
    if (body) {
        // Check if the client sent base64 encoded data
        if (encoding === 'base64') {
            res.send(Buffer.from(body, 'base64'));
        } else {
            res.send(body);
        }
    } else {
        res.end();
    }
    
    console.log(`Sent response for request ${message.id}`);
}

function handleWsUpgradeSuccess(message) {
    const { pendingUpgrades } = require('./httpProxy');
    const pending = pendingUpgrades.get(message.id);
    if (!pending) return;
    
    const { socket, head } = pending;
    const { headers } = message.data;
    
    // Build the upgrade response
    let response = 'HTTP/1.1 101 Switching Protocols\r\n';
    for (const [key, value] of Object.entries(headers)) {
        response += `${key}: ${value}\r\n`;
    }
    response += '\r\n';
    
    // Send the upgrade response to the client
    socket.write(response);
    
    // If there's any buffered data (head), we need to handle it
    if (head && head.length > 0) {
        sendToClient({
            type: MESSAGE_TYPES.WS_DATA,
            id: message.id,
            data: head.toString('base64')
        });
    }
    
    // Store the socket for bidirectional communication
    activeWebSockets.set(message.id, socket);
    
    // Forward data from browser to tunnel
    socket.on('data', (data) => {
        sendToClient({
            type: MESSAGE_TYPES.WS_DATA,
            id: message.id,
            data: data.toString('base64')
        });
    });
    
    socket.on('close', () => {
        activeWebSockets.delete(message.id);
        pendingUpgrades.delete(message.id);
        sendToClient({
            type: MESSAGE_TYPES.WS_CLOSE,
            id: message.id
        });
    });
    
    socket.on('error', (err) => {
        console.error(`WebSocket error for ${message.id}:`, err.message);
        activeWebSockets.delete(message.id);
        pendingUpgrades.delete(message.id);
    });
    
    // Remove from pending (but keep socket reference in activeWebSockets)
    pendingUpgrades.delete(message.id);
    
    console.log(`WebSocket upgrade successful for ${message.id}`);
}

function handleWsUpgradeFailure(message) {
    const { pendingUpgrades } = require('./httpProxy');
    const pending = pendingUpgrades.get(message.id);
    if (!pending) return;
    
    const { socket } = pending;
    socket.destroy();
    pendingUpgrades.delete(message.id);
    
    console.log(`WebSocket upgrade failed for ${message.id}`);
}

function handleWsData(message) {
    const socket = activeWebSockets.get(message.id);
    if (!socket) return;
    
    const data = Buffer.from(message.data, 'base64');
    socket.write(data);
}

function handleWsClose(message) {
    const socket = activeWebSockets.get(message.id);
    if (!socket) return;
    
    socket.end();
    activeWebSockets.delete(message.id);
}

console.log(`Tunnel server listening on port ${WEBSOCKET_PORT}`);

module.exports = { sendToClient };