// Import .env settings and start the tunnel client.
require('dotenv').config();
const { connect } = require('./tunnelClient');

console.log('Starting tunnel client...');
connect();