/* jshint node: true */
// This is the config used for development on the cnn creator
'use strict';
var config = require('./config.base.js'),
    validateConfig = require('webgme/config/validator');

config.client.log.level = 'debug';

config.visualization.visualizerDescriptors = ['./src/visualizers/Visualizers-dev.json'];
config.visualization.panelPaths.push('./src/visualizers/panels');

validateConfig(config);
module.exports = config;
