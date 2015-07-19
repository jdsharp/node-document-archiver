var _ = require('lodash');
var glob = require('glob');
var fs = require('fs');
var Archiver = require('./lib/archiver');

var arch = new Archiver();


var rules = require('./config');

console.log('Found ' + rules.length + ' rule' + ( rules.length !== 1 ? 's' : '' ));

_.forEach(rules, function(rule) {
  var enabled = _.get(rule, 'enabled', true) === true;
  if ( enabled ) {
    console.log('Rule:', rule.rule);
    arch.exec(rule);
  }
});
console.log('Done.');