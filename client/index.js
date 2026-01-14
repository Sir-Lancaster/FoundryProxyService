require('dotenv').config();
const { connect } = require('./tunnelClient');

console.log('Starting tunnel client...');
connect();