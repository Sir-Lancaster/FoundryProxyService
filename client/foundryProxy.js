const { FOUNDRY_URL } = require('./config');
const { MESSAGE_TYPES } = require('../shared/protocol');

async function sendToFoundry(message) {
    const UUID = message.id;
    const requestURL = FOUNDRY_URL + message.data.url;
    
    console.log(`[Foundry] ${message.data.method} ${message.data.url}`);
    
    let response;
    try {
        // Prepare fetch options
        const fetchOptions = {
            method: message.data.method,
            headers: { ...message.data.headers }, // Create a copy
            redirect: 'manual'
        };

        // Only add body if we actually have content AND it's a method that supports body
        if (message.data.body && 
            message.data.body !== null && 
            message.data.body !== '' && 
            ['POST', 'PUT', 'PATCH'].includes(message.data.method.toUpperCase())) {
            fetchOptions.body = message.data.body;
        }

        // Remove problematic headers
        delete fetchOptions.headers['host'];
        delete fetchOptions.headers['connection'];
        
        // If we don't have a body, make sure content-length is removed
        if (!fetchOptions.body) {
            delete fetchOptions.headers['content-length'];
        }

        response = await fetch(requestURL, fetchOptions);
        
    } catch (error) {
        console.error('Error connecting to Foundry:', error);
        return {
            type: MESSAGE_TYPES.HTTP_RESPONSE,
            id: UUID,
            data: {
                statusCode: 503,
                headers: { 'Content-Type': 'text/plain' },
                body: 'Proxy Error: Unable to reach Foundry. Is it running?'
            }
        };
    }

    const headersObj = Object.fromEntries(response.headers.entries());
    const contentType = headersObj['content-type'] || '';
    
    // For redirects (3xx status codes), don't try to read body
    let body = '';
    if (response.status < 300 || response.status >= 400) {
        // Determine if this is binary or text data
        const isBinary = contentType.includes('image/') || 
                         contentType.includes('font/') ||
                         contentType.includes('woff') ||
                         contentType.includes('application/octet-stream') ||
                         contentType.includes('application/pdf');
        
        if (isBinary) {
            // For binary data, convert to base64
            const buffer = await response.arrayBuffer();
            body = Buffer.from(buffer).toString('base64');
            headersObj['x-binary-data'] = 'true'; // Flag for server to decode
        } else {
            // For text data (HTML, CSS, JS, JSON)
            body = await response.text();
        }
    } else {
        // For redirects, read the small body if it exists
        try {
            body = await response.text();
        } catch (e) {
            // Ignore errors reading redirect body
            body = '';
        }
    }
    
    // Remove compression headers
    delete headersObj['content-encoding'];
    delete headersObj['content-length'];

    return {
        type: MESSAGE_TYPES.HTTP_RESPONSE,
        id: UUID,
        data: {
            statusCode: response.status,
            headers: headersObj,
            body: body
        }
    };
}

module.exports = { sendToFoundry };