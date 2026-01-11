require('dotenv').config();
module.exports = {
    PORT: process.env.PORT,
    AUTH_TOKEN: process.env.AUTH_TOKEN,
    WEBSOCKET_PORT: process.env.WEBSOCKET_PORT
}