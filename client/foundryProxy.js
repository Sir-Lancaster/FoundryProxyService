const { FOUNDRY_URL } = require('./config');
const { MESSAGE_TYPES } = require('../shared/protocol');

async function sendToFoundry(message) {
    const UUID = message.id;
    const requestURL = FOUNDRY_URL + message.data.url;
    
    console.log(`[Foundry] ${message.data.method} ${message.data.url}`);
    
    // ADD THIS - Log what we're sending to Foundry
    if (message.data.url === '/') {
        console.log('ROOT REQUEST HEADERS:', JSON.stringify(message.data.headers, null, 2));
    }

    let response;
    try {
        response = await fetch(requestURL, {
            method: message.data.method,
            headers: message.data.headers,
            body: message.data.body
        });
        
        // ADD THIS - Log what Foundry returns
        if (message.data.url === '/') {
            console.log('ROOT RESPONSE STATUS:', response.status);
            console.log('ROOT RESPONSE HEADERS:', JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2));
        }
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
    
    // Determine if this is binary or text data
    const isBinary = contentType.includes('image/') || 
                     contentType.includes('font/') ||
                     contentType.includes('woff') ||
                     contentType.includes('application/octet-stream') ||
                     contentType.includes('application/pdf');
    
    let body;
    if (isBinary) {
        // For binary data, convert to base64
        const buffer = await response.arrayBuffer();
        body = Buffer.from(buffer).toString('base64');
        headersObj['x-binary-data'] = 'true'; // Flag for server to decode
    } else {
        // For text data (HTML, CSS, JS, JSON)
        body = await response.text();
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