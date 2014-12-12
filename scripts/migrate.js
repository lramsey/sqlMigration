var _ = require('lodash');
var when = require('when');
var MySQL = require('../utility/util');

MySQL.prototype.migrate = function(){

};

var playfully_prod = new MySQL('playfully_prod');
module.exports = playfully_prod.migrate.bind(playfully_prod);
