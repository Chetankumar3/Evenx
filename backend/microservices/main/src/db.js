'use strict';

const { Sequelize } = require('sequelize');
const config = require('./config');
const initModels = require('../models'); // provided models.js at service root

const sequelize = config.db.url
  ? new Sequelize(config.db.url, { dialect: 'postgres', logging: false })
  : new Sequelize(config.db.database, config.db.user, config.db.password, {
      host: config.db.host,
      port: config.db.port,
      dialect: 'postgres',
      logging: false,
    });

const models = initModels(sequelize);

module.exports = { sequelize, ...models };
