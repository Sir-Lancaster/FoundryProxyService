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

app.all('*', (req, res) => {
    const UUID = crypto.randomUUID();
    pendingRequests.set(UUID, res);

    const message = {
        type: MESSAGE_TYPES.HTTP_REQUEST,
        id: UUID,
        data: {
            method: req.method,
            url: req.url,
            headers: req.headers,
            body: req.body
        }
    };

    sendToClient(message);
})