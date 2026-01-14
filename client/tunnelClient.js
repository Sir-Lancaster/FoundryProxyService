const { io } = require('socket.io-client');
const http = require('http');
const net = require('net');
const { AUTH_TOKEN, SERVER_URL, FOUNDRY_URL } = require('./config');
const { MESSAGE_TYPES } = require('../shared/protocol');

let socket = null;

// Store active WebSocket connections to Foundry
const activeConnections = new Map();

function connect() {
    console.log(`Connecting to tunnel server at ${SERVER_URL}...`);
    
    socket = io(SERVER_URL, {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000
    });
    
    socket.on('connect', () => {
        console.log('Connected to tunnel server, authenticating...');
        socket.emit('auth', AUTH_TOKEN);
    });
    
    socket.on('message', (message) => {
        switch (message.type) {
            case MESSAGE_TYPES.AUTH_SUCCESS:
                console.log('Authentication successful!');
                break;
            case MESSAGE_TYPES.AUTH_FAILURE:
                console.error('Authentication failed!');
                process.exit(1);
                break;
            case MESSAGE_TYPES.HTTP_REQUEST:
                handleHttpRequest(message);
                break;
            case MESSAGE_TYPES.WS_UPGRADE:
                handleWsUpgrade(message);
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
        console.log('Disconnected from tunnel server');
        // Clean up all WebSocket connections
        for (const [id, conn] of activeConnections) {
            conn.destroy();
        }
        activeConnections.clear();
    });
    
    socket.on('connect_error', (err) => {
        console.log('Temporary connection failure, retrying...');
    });
}

function handleHttpRequest(message) {
    const { method, url, headers, body } = message.data;
    const foundryUrl = new URL(FOUNDRY_URL);
    
    // Clean up headers - don't request compressed content
    const cleanHeaders = { ...headers };
    delete cleanHeaders['host'];
    delete cleanHeaders['accept-encoding']; // Prevent compressed responses
    cleanHeaders['host'] = foundryUrl.host;
    
    const options = {
        hostname: foundryUrl.hostname,
        port: foundryUrl.port || 80,
        path: url,
        method: method,
        headers: cleanHeaders
    };
    
    const req = http.request(options, (res) => {
        let chunks = [];
        
        res.on('data', (chunk) => chunks.push(chunk));
        
        res.on('end', () => {
            const buffer = Buffer.concat(chunks);
            
            // Remove content-encoding since we're sending raw
            const responseHeaders = { ...res.headers };
            delete responseHeaders['content-encoding'];
            delete responseHeaders['transfer-encoding'];
            
            // Update content-length to actual size
            responseHeaders['content-length'] = buffer.length;
            
            // Always send as base64 to preserve binary data
            socket.emit('message', {
                type: MESSAGE_TYPES.HTTP_RESPONSE,
                id: message.id,
                data: {
                    statusCode: res.statusCode,
                    headers: responseHeaders,
                    body: buffer.toString('base64'),
                    encoding: 'base64'
                }
            });
        });
    });
    
    req.on('error', (err) => {
        console.error(`Proxy error: ${err.message}`);
        socket.emit('message', {
            type: MESSAGE_TYPES.HTTP_RESPONSE,
            id: message.id,
            data: {
                statusCode: 502,
                headers: {},
                body: 'Bad Gateway'
            }
        });
    });
    
    // Set a timeout
    req.setTimeout(30000, () => {
        req.destroy();
        socket.emit('message', {
            type: MESSAGE_TYPES.HTTP_RESPONSE,
            id: message.id,
            data: {
                statusCode: 504,
                headers: {},
                body: 'Gateway Timeout'
            }
        });
    });
    
    if (body) {
        req.write(body);
    }
    req.end();
}

function handleWsUpgrade(message) {
    const { url, headers } = message.data;
    const foundryUrl = new URL(FOUNDRY_URL);
    
    console.log(`[WS] Upgrading connection: ${url}`);
    
    // Create a raw TCP connection to Foundry
    const conn = net.createConnection({
        host: foundryUrl.hostname,
        port: foundryUrl.port || 80
    });
    
    conn.on('connect', () => {
        // Build the upgrade request
        const cleanHeaders = { ...headers };
        cleanHeaders['host'] = foundryUrl.host;
        
        let request = `GET ${url} HTTP/1.1\r\n`;
        for (const [key, value] of Object.entries(cleanHeaders)) {
            request += `${key}: ${value}\r\n`;
        }
        request += '\r\n';
        
        conn.write(request);
    });
    
    let upgradeHandled = false;
    let buffer = Buffer.alloc(0);
    
    conn.on('data', (data) => {
        if (!upgradeHandled) {
            // Look for the end of HTTP headers
            buffer = Buffer.concat([buffer, data]);
            const headerEnd = buffer.indexOf('\r\n\r\n');
            
            if (headerEnd !== -1) {
                upgradeHandled = true;
                
                const headerStr = buffer.slice(0, headerEnd).toString();
                const lines = headerStr.split('\r\n');
                const statusLine = lines[0];
                
                // Check if upgrade was successful
                if (statusLine.includes('101')) {
                    // Parse headers
                    const responseHeaders = {};
                    for (let i = 1; i < lines.length; i++) {
                        const colonIdx = lines[i].indexOf(':');
                        if (colonIdx !== -1) {
                            const key = lines[i].slice(0, colonIdx).trim();
                            const value = lines[i].slice(colonIdx + 1).trim();
                            responseHeaders[key] = value;
                        }
                    }
                    
                    // Store the connection
                    activeConnections.set(message.id, conn);
                    
                    // Send success to server
                    socket.emit('message', {
                        type: MESSAGE_TYPES.WS_UPGRADE_SUCCESS,
                        id: message.id,
                        data: { headers: responseHeaders }
                    });
                    
                    // Handle any remaining data after headers
                    const remaining = buffer.slice(headerEnd + 4);
                    if (remaining.length > 0) {
                        socket.emit('message', {
                            type: MESSAGE_TYPES.WS_DATA,
                            id: message.id,
                            data: remaining.toString('base64')
                        });
                    }
                    
                    console.log(`[WS] Upgrade successful: ${message.id}`);
                } else {
                    // Upgrade failed
                    socket.emit('message', {
                        type: MESSAGE_TYPES.WS_UPGRADE_FAILURE,
                        id: message.id,
                        data: { reason: statusLine }
                    });
                    conn.destroy();
                    console.log(`[WS] Upgrade failed: ${statusLine}`);
                }
            }
        } else {
            // Forward WebSocket data to server
            socket.emit('message', {
                type: MESSAGE_TYPES.WS_DATA,
                id: message.id,
                data: data.toString('base64')
            });
        }
    });
    
    conn.on('close', () => {
        activeConnections.delete(message.id);
        socket.emit('message', {
            type: MESSAGE_TYPES.WS_CLOSE,
            id: message.id
        });
    });
    
    conn.on('error', (err) => {
        console.error(`[WS] Connection error for ${message.id}:`, err.message);
        socket.emit('message', {
            type: MESSAGE_TYPES.WS_UPGRADE_FAILURE,
            id: message.id,
            data: { reason: err.message }
        });
        activeConnections.delete(message.id);
    });
}

function handleWsData(message) {
    const conn = activeConnections.get(message.id);
    if (!conn) return;
    
    const data = Buffer.from(message.data, 'base64');
    conn.write(data);
}

function handleWsClose(message) {
    const conn = activeConnections.get(message.id);
    if (!conn) return;
    
    conn.end();
    activeConnections.delete(message.id);
}

module.exports = { connect };