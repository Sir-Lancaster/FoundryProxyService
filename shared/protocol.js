// Export message type constants so both client and server use same strings
module.exports = { MESSAGE_TYPES: {
    CONNECTION_REQUEST: 'connection_request',
    CONNECTION_RESPONSE: 'connection_response',
    HTTP_REQUEST: 'http_request',
    HTTP_RESPONSE: 'http_response',
    PING: 'ping',
    PONG: 'pong',
    ERROR: 'error'
}};