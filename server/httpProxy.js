const http = require('http');
const express = require('express');
const httpProxy = require('http-proxy');
const crypto = require('crypto');
const { PORT } = require('./config');
const { MESSAGE_TYPES } = require('../shared/protocol');
const { pendingRequests } = require('./pendingRequests');
const { sendToClient } = require('./tunnelServer');

// Create proxy for WebSocket connections
const proxy = httpProxy.createProxyServer({
    target: 'http://localhost:30000',  // Foundry's address
    ws: true  // Enable WebSocket proxying
});

// Handle proxy errors
proxy.on('error', (err, req, res) => {
    console.error('Proxy error:', err);
    if (res.writeHead) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Proxy error');
    }
});

// Create Express app for HTTP
const app = express();

// Parse different content types
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.raw({ type: '*/*', limit: '10mb' })); // Capture all other content as raw buffer

// Regular HTTP traffic goes through tunnel
app.use((req, res) => {
    console.log(`[HTTP] ${req.method} ${req.url}`);
    
    const requestId = crypto.randomUUID();
    pendingRequests.set(requestId, res);
    
    // Set timeout
    const timeout = setTimeout(() => {
        if (pendingRequests.has(requestId)) {
            console.error(`Request ${requestId} timed out`);
            res.status(504).send('Gateway Timeout');
            pendingRequests.delete(requestId);
        }
    }, 30000);
    
    res.on('finish', () => clearTimeout(timeout));
    
    // Handle different body types - be more careful about empty bodies
    let body = null; // Start with null
    
    if (req.body !== undefined && req.body !== null) {
        if (Buffer.isBuffer(req.body)) {
            // Only process non-empty buffers
            if (req.body.length > 0) {
                const contentType = req.headers['content-type'] || '';
                if (contentType.includes('application/json') || contentType.includes('text/') || contentType.includes('application/x-www-form-urlencoded')) {
                    body = req.body.toString();
                } else {
                    body = req.body.toString('base64');
                }
            }
        } else if (typeof req.body === 'string' && req.body.length > 0) {
            body = req.body;
        } else if (typeof req.body === 'object' && Object.keys(req.body).length > 0) {
            body = JSON.stringify(req.body);
        }
    }
    
    // Clean up headers - remove content-length if no body
    const headers = { ...req.headers };
    if (!body) {
        delete headers['content-length'];
    }
    
    const message = {
        type: MESSAGE_TYPES.HTTP_REQUEST,
        id: requestId,
        data: {
            method: req.method,
            url: req.url,
            headers: headers,
            body: body
        }
    };
    
    const sent = sendToClient(message);
    
    if (!sent) {
        clearTimeout(timeout);
        res.status(503).send('Tunnel not connected');
        pendingRequests.delete(requestId);
    }
});

// Create HTTP server
const server = http.createServer(app);

// Handle WebSocket upgrade requests
server.on('upgrade', (req, socket, head) => {
    console.log(`[WebSocket] Upgrade request: ${req.url}`);
    
    // Proxy WebSocket directly to Foundry
    proxy.ws(req, socket, head);
});

server.listen(PORT, () => {
    console.log(`HTTP proxy listening on port ${PORT}`);
});