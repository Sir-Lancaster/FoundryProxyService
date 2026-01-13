const { WEBSOCKET_PORT, AUTH_TOKEN } = require('./config');
const { Server } = require('socket.io');
const { MESSAGE_TYPES } = require('../shared/protocol');
const { pendingRequests } = require('./pendingRequests');

const io = new Server(WEBSOCKET_PORT, {
    pingTimeout: 60000,      // 60 seconds (default is 20s)
    pingInterval: 25000,     // 25 seconds (default is 25s)
    maxHttpBufferSize: 1e8   // 100 MB (default is 1MB!)
});

let tunnelClient = null; 

io.on('connection', (socket) => {
    console.log('Client attempting to connect:', socket.id);
    
    // Wait for authentication before storing
    socket.on('message', (message) => {
        handleMessage(message, socket);
    });
    
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        if (tunnelClient === socket) {
            tunnelClient = null;
        }
    });
});

function handleMessage(message, socket) {
    // Validate message structure
    if (!message || !message.type) {
        console.error('Invalid message received:', message);
        return;
    }
    
    // Route based on type
    switch (message.type) {
        case MESSAGE_TYPES.CONNECTION_REQUEST:
            handleConnectionRequest(message, socket);
            break;
        case MESSAGE_TYPES.HTTP_RESPONSE:
            handleHttpResponse(message);
            break;
        case MESSAGE_TYPES.PING:
            sendPong(socket);
            break;
        case MESSAGE_TYPES.PONG:
            updateTimestamp(socket);
            break;
        default:
            console.warn('Unknown message type:', message.type);
    }
}

function handleConnectionRequest(message, socket) {
    if (!message.data || message.data.auth_token !== AUTH_TOKEN) {
        socket.emit('message', {
            type: MESSAGE_TYPES.CONNECTION_RESPONSE,
            data: {
                success: false,
                message: "Error: Unauthorized Token"
            }
        });
        socket.disconnect(true);
        return;
    }

    // If there was already a client, disconnect it first
    if (tunnelClient && tunnelClient !== socket) {
        console.log('Replacing existing tunnel client connection');
        tunnelClient.disconnect();
    }

    tunnelClient = socket;
    console.log('Client authenticated successfully');
    
    socket.emit('message', {
        type: MESSAGE_TYPES.CONNECTION_RESPONSE,
        data: {
            success: true,
            message: "Connected Successfully"
        }
    });
}

function handleHttpResponse(message) {
    const res = pendingRequests.get(message.id);
    
    if (!res) {
        console.error('No pending request found for ID:', message.id);
        return;
    }
    
    const { statusCode, headers, body } = message.data;
    
    // Check if this is binary data that was base64 encoded
    let responseBody = body;
    if (headers['x-binary-data'] === 'true') {
        // Decode base64 back to binary
        responseBody = Buffer.from(body, 'base64');
        delete headers['x-binary-data']; // Remove our custom header
    }
    
    res.status(statusCode)
       .set(headers)
       .send(responseBody);
    
    pendingRequests.delete(message.id);
    console.log(`Sent response for request ${message.id}`);
}

function sendPong(socket) {
    socket.emit('message', { type: MESSAGE_TYPES.PONG});
}

function updateTimestamp(socket) {
    // just logging for now
    console.log('Recieved pong from client')
}

function sendToClient(message) {
    if (!tunnelClient) {
        console.error('No tunnel client connected');
        return false;
    }

    tunnelClient.emit('message', message);
    return true;
}

console.log(`Tunnel server listening on port ${WEBSOCKET_PORT}`);

module.exports = { sendToClient };