const io = require('socket.io-client');
const { SERVER_URL, AUTH_TOKEN } = require('./config');
const { MESSAGE_TYPES } = require('../shared/protocol');
const { sendToFoundry } = require('./foundryProxy');

const socket = io(SERVER_URL, {
    reconnectionDelayMax: 10000,
    timeout: 60000,           // 60 seconds
    transports: ['websocket'] // Force WebSocket, skip polling
});

// Connection established
socket.on('connect', () => {
    console.log('Connected to server, attempting authentication...');
    
    socket.emit('message', {
        type: MESSAGE_TYPES.CONNECTION_REQUEST,
        data: {
            auth_token: AUTH_TOKEN
        }
    });
});

// Receive messages from server
socket.on('message', (message) => {
    handleMessage(message);
});

// Connection lost
socket.on('disconnect', (reason) => {
    console.log('Disconnected from server. Reason:', reason);
});

// Connection error
socket.on('connect_error', (error) => {
    if (socket.active) {
        console.log('Temporary connection failure, retrying...');
    } else {
        console.error('Connection error:', error.message);
    }
});

// Message router
function handleMessage(message) {
    if (!message || !message.type) {
        console.error('Invalid message received:', message);
        return;
    }
    
    switch (message.type) {
        case MESSAGE_TYPES.CONNECTION_RESPONSE:
            handleConnectionResponse(message);
            break;
        case MESSAGE_TYPES.HTTP_REQUEST:
            handleHttpRequest(message);
            break;
        case MESSAGE_TYPES.PING:
            sendPong();
            break;
        default:
            console.warn('Unknown message type:', message.type);
    }
}

function handleConnectionResponse(message) {
    if (message.data.success) {
        console.log('Authenticated successfully');
    } else {
        console.error('Authentication failed:', message.data.message);
        process.exit(1);
    }
}

async function handleHttpRequest(message) {
    // TODO: Implement 
    if (!message.id) {
        console.log("http_request missing ID field.");
        socket.emit('message', {
            type: MESSAGE_TYPES.ERROR,
            data: {
                message: "ERROR: Request did not have an ID, unable to process request"
            }
        });
        return;
    }
    if (!message.data) {
        console.log("http_request missing field DATA");
        socket.emit('message', {
            type: MESSAGE_TYPES.ERROR,
            data: {
                requestId: message.id,
                message: "ERROR: invalid request data."
            }
        });
        return;
    }
    if (!message.data.method || !message.data.url || !message.data.headers) {
        console.log("http_request missing fields in data");
        socket.emit('message', {
            type: MESSAGE_TYPES.ERROR,
            data: {
                requestId: message.id,
                message: "ERROR: Request missing required method/url/headers"
            }
        });
        return;
    }
    
    const foundryResponse = await sendToFoundry(message);
    socket.emit('message', foundryResponse);
}

function sendPong() {
    socket.emit('message', { type: MESSAGE_TYPES.PONG });
}

console.log(`Connecting to tunnel server at ${SERVER_URL}...`);