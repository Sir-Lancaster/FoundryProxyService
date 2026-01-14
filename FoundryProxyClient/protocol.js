const MESSAGE_TYPES = {
    // Authentication
    AUTH: 'auth',
    AUTH_SUCCESS: 'auth_success',
    AUTH_FAILURE: 'auth_failure',
    
    // HTTP
    HTTP_REQUEST: 'http_request',
    HTTP_RESPONSE: 'http_response',
    
    // WebSocket tunneling
    WS_UPGRADE: 'ws_upgrade',
    WS_UPGRADE_SUCCESS: 'ws_upgrade_success',
    WS_UPGRADE_FAILURE: 'ws_upgrade_failure',
    WS_DATA: 'ws_data',
    WS_CLOSE: 'ws_close'
};

module.exports = { MESSAGE_TYPES };