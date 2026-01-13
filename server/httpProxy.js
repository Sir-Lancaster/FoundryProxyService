const express = require('express');
const crypto = require('crypto');
const { PORT } = require('./config');
const { MESSAGE_TYPES } = require('../shared/protocol');
const { pendingRequests } = require('./pendingRequests');
const { sendToClient } = require('./tunnelServer');

const app = express();

app.use(express.json());
app.listen(PORT, () => {
    console.log(`HTTP proxy listening on port ${PORT}`)
});

app.use((req, res) => {
    console.log(`[HTTP] ${req.method} ${req.url}`);
    
    const requestId = crypto.randomUUID();
    pendingRequests.set(requestId, res);
    
    // Set timeout for this request
    const timeout = setTimeout(() => {
        if (pendingRequests.has(requestId)) {
            console.error(`Request ${requestId} timed out`);
            res.status(504).send('Gateway Timeout');
            pendingRequests.delete(requestId);
        }
    }, 30000); // 30 second timeout
    
    // Store timeout so we can clear it later
    res.on('finish', () => clearTimeout(timeout));
    
    const message = {
        type: MESSAGE_TYPES.HTTP_REQUEST,
        id: requestId,
        data: {
            method: req.method,
            url: req.url,
            headers: req.headers,
            body: req.body
        }
    };
    
    const sent = sendToClient(message);
    
    if (!sent) {
        clearTimeout(timeout);
        res.status(503).send('Tunnel not connected');
        pendingRequests.delete(requestId);
    }
});