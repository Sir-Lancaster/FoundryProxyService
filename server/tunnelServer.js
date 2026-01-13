const { WEBSOCKET_PORT, AUTH_TOKEN } = require('./config');
const { Server } = require('socket.io');
const { MESSAGE_TYPES } = require('../shared/protocol');
const { pendingRequests } = require('./pendingRequests');

const io = new Server(WEBSOCKET_PORT);
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
    if (message.data.auth_token !== AUTH_TOKEN) {
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
    tunnelClient = socket;
    socket.emit('message', {
        type: MESSAGE_TYPES.CONNECTION_RESPONSE,
        data: {
            success: true,
            message: "Connected Successfully"
        }
    })
}

function handleHttpResponse(message) {
    // Look up the original Express response object
    const res = pendingRequests.get(message.id);
    
    if (!res) {
        console.error('No pending request found for ID:', message.id);
        return;
    }
    
    // Extract response data from the message
    const { statusCode, headers, body } = message.data;
    
    // Send response back to player's browser using Express
    res.status(statusCode)
       .set(headers)
       .send(body);
    
    // Clean up
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