#!/usr/bin/env node

const program = require('commander');
const path = require("path");

const defaultConfigPath = 'api2ts.config.js';
program
  .option('-c, --config <configPath>', 'specific config path')
  .action((name, option) => {
    const cfg = require(path.resolve(process.cwd(), option.configPath || defaultConfigPath));
    if (!cfg)
    {
      throw Error('loss config file')
    }
    require('../src/index')(cfg);
  })
