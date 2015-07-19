var _ = require('lodash');
var glob = require('glob');
var path = require('path');
var fs = require('fs');
var fse = require('fs-extra')
var mkdirp = require('mkdirp');

function installDefaults(obj) {

  function parseFilename(filename, args) {
    // Parts: Date, category, tags, description, extension
    var parts = {
      date     : null,
      category : null,
      tags     : [],
      name     : null,
      ext      : path.extname(filename).toLowerCase(),
      path     : path.dirname(filename),
      filename : path.basename(filename)
    };

    var matched;
    var next = parts.filename.substr(0, parts.filename.length - parts.ext.length);

    // Date
    matched = next.match(/^(\d{4}(?:-\d{2}(?:-\d{2})?)?)(?:\s*)?(?:-\s*)?(.*)/);
    if ( matched ) {
      parts.date = matched[1];
      next = matched[2];
    } else if ( _.get(args, 'defaultCreateDate', false) === true ) {
      var stats = fs.statSync(filename);
      var mm = stats.ctime.getUTCMonth() + 1;
      var dd = stats.ctime.getUTCDate();
      parts.date = stats.ctime.getFullYear() + '-' + ( mm < 10 ? '0' + mm : mm ) + '-' ( dd < 10 ? '0' + dd : dd );
    }

    // Category
    matched = null;
    matched = next.match(/^([^-]+)(?:\s*-\s*)?(.*)/);
    if ( matched ) {
      if ( matched[1].toUpperCase() != matched[1] ) {
        parts.category = matched[1];
        next = matched[2];
      }
    }

    // Tags
    matched = null;
    matched = next.match(/([A-Z0-9\s]+)(?:\s*-\s*)?(.*)/);
    if ( matched ) {
      parts.tags = _.compact(matched[1].split(/\s+/));
      next = matched[2];
    }

    // Name
    parts.name = next.replace(/(^\s|\s$)/g, '');

    if ( parts.category && parts.category != '' && parts.name === '' ) {
      parts.name     = parts.category;
      parts.category = null;
    }

    if ( args && args.filter && _.isFunction(args.filter) ) {
      parts = args.filter(parts, file, args, overlay);
      if ( !parts ) {
        console.error('  [parsedFilename]: Filter did not return a valid value', parts);
        return false;
      }
    }

    parts.update = function() {
      this.filename = _.compact([
        this.date,
        this.category,
        this.tags.join(' ').toUpperCase(),
        this.name
      ]).join(' - ') + this.ext;
    };

    parts.update();

    return parts;
  };

  obj.defineTest('file-prefix-fulldate', function(args, file) {
    return path.basename(file).match(/^\d{4}-\d{2}-\d{2}/) !== null;
  });

  obj.defineTest('tags', function(args, file) {
    var parts = parseFilename(file);
    if ( _.get(args, 'any', false) !== false ) {
      if ( _.intersection(parts.tags, args.any).length === 0 ) {
        return false;
      }
    }
    if ( _.get(args, 'not', false) !== false ) {
      if ( _.intersection(parts.tags, args.not).length > 0 ) {
        return false;
      }
    }
    if ( _.get(args, 'required', false) !== false ) {
      if ( _.intersection(parts.tags, args.required).length !== args.required.length ) {
        return false;
      }
    }
    return true;
  });

  obj.defineTest('file-ext', function(args, file) {
    var matched = _.map(args.ext, function(ext) {
      return file.match(new RegExp('\.' + ext + '$', 'i')) !== null;
    });
    return _.compact(matched).length > 0;
  });


  obj.defineAction('move', function(state, args) {
    var dest = _.get(args, 'dest', false);
    if ( !dest ) {
      dest = path.dirname(state.file);
    }
    var filename = _.get(args, 'filename', path.basename(state.file));

    if ( fse.ensureDirSync(dest) === false ) {
      console.error('  MOVE: * Failed to assert path exists', args, state);
      return false;
    }

    var target = path.join(dest, filename);
    if ( fs.existsSync(target) && !_.get(args, 'overwrite', false) ) {
      console.warn('  MOVE: * Destination Exists:', target);
      return false;
    }

    console.log('  MOVE:', target);
    var ret = fs.renameSync(state.file, target);
    if ( ret === false ) {
      return false;
    }
    state.file = target;
    return state;
  });

  obj.defineAction('copy', function(state, args) {
    if ( fse.ensureDirSync(args.dest) === false ) {
      console.error('  COPY: * Failed to assert path exists', args, state.file);
      return false;
    }
    var dest = path.join(args.dest, path.basename(state.file));
    if ( fs.existsSync(dest) && !_.get(args, 'overwrite', false) ) {
      console.warn('  COPY: * Destination Exists:', dest);
      return false; 
    }

    console.log('  COPY:', dest);
    var ret = fse.copySync(state.file, dest);
    if ( ret === false ) {
      console.log('Failed to copy', ret);
      return false;
    }
    state.file = dest;
    return state;
  });

  obj.defineAction('normalize-file', function(state, args, overlay) {
    var parts = parseFilename(state.file, args);
    parts = _.defaults(overlay ? overlay : {}, parts);

    console.log('  NORMALIZE-FILE:', parts.filename);

    if ( parts.filename === path.basename(state.file) ) {
      return true;
    }

    var destFile = path.join(path.dirname(file), parts.filename);
    if ( fs.renameSync(file, destFile) ) {
      state.file = destFile;
      return state;
    }
    return false;
  });

  obj.defineAction('categorize', function(state, args) {
    return this.runAction(state, { action : 'normalize-file' }, args);
  });

  obj.defineAction('tags', function(state, args) {
    var parts = parseFilename(state.file, args);
    if ( !parts ) {
      return false;
    }

    if ( _.get(args, 'add', false) !== false ) {
      parts.tags = parts.tags.concat(args.add);
    }

    if ( _.get(args, 'remove', false) !== false ) {
      parts.tags = _.difference(parts.tags, args.remove);
    }

    if ( _.get(args, 'set', false) !== false ) {
      parts.tags = args.set;
    }

    parts.tags = _.uniq(parts.tags);
    parts.update();

    if ( parts.filename === path.basename(state.file) ) {
      return true;
    }

    return this.runAction(state, { action : 'move', filename : parts.filename });
  });

  obj.defineAction('folders-by-year', function(state, args) {
    var parts = parseFilename(state.file, args);
    if ( !parts ) {
      return false;
    }

    if ( parts.date ) {
      var target = path.join( path.dirname(state.file), parts.date.substr(0, 4) );
      console.log('  FOLDERS-BY-YEAR:', target);
      return this.runAction(state, { action : 'move', dest : target });
    }
    return true;
  });

  obj.defineAction('folders-by-year-month', function(state, args) {
    var parts = parseFilename(state.file, args);
    if ( !parts ) {
      return false;
    }

    if ( parts.date ) {
      var target = path.join( path.dirname(state.file), parts.date.substr(0, 7).replace(/-/g, '/') );
      console.log('  FOLDERS-BY-YEAR-MONTH:', target);
      return this.runAction(state, { action : 'move', dest : target });
    }
    return true;
  });

  obj.defineAction('folders-by-ymd', function(state, args) {
    var parts = parseFilename(state.file, args);
    if ( !parts ) {
      return false;
    }

    if ( parts.date ) {
      var target = path.join( path.dirname(state.file), parts.date.replace(/-/g, '/') );
      console.log('  FOLDERS-BY-YMD:', target);
      return this.runAction(state, { action : 'move', dest : target });
    }
    return true;
  });
}

var Archiver = function() {
  this.tests = {};
  this.actions = {};

  installDefaults(this);
};

_.assign(Archiver.prototype, {
  defineTest: function(name, exec) {
    this.tests[name] = exec;
    return this;
  },

  defineAction: function(name, exec) {
    this.actions[name] = exec;
    return this;
  },

  runTest: function(test, file, extra) {
    if ( _.get(this.tests, test.test, null) !== null ) {
      return this.tests[test.test].call(this, test, file, extra);
    }
    console.error('Test not defined:', test);
    return false;
  },

  runAction: function(state, action, extra) {
    if ( _.get(this.actions, action.action, null) !== null ) {
      console.log("  " + action.action.toUpperCase() + ': ' + JSON.stringify(action));
      return this.actions[action.action].call(this, state, action, extra);
    }
    console.error('Action not defined:', action);
    return false;
  },

  exec: function(rule) {
    glob(rule.src, {}, function(err, files) {
      if ( err ) {
        console.error('Glob error: ', err);
        console.dir(rule);
        return;
      }
      console.log("  Matched " + files.length + ' file' + (files.length !== 1 ? 's' : ''));
      _.forEach(files, function(file) {
        console.log('  > File:', file);
        var passed = _.map(rule.match, function(test) {
          return this.runTest(test, file);
        }, this);

        // console.log('Passed:', passed);
        if ( _.compact(passed).length == rule.match.length ) {
          var state = {
            originalFile : file,
            file         : file
          };

          _.forEach(rule.run, function(action) {
            var ret = this.runAction(state, action);
            if ( _.isPlainObject(ret) ) {
              state = ret;
              return true;
            }
            return ret;
          }, this);
        }
      }, this);
    }.bind(this));
  }
});



module.exports = Archiver;