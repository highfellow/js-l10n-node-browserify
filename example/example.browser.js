(function(){var require = function (file, cwd) {
    var resolved = require.resolve(file, cwd || '/');
    var mod = require.modules[resolved];
    if (!mod) throw new Error(
        'Failed to resolve module ' + file + ', tried ' + resolved
    );
    var cached = require.cache[resolved];
    var res = cached? cached.exports : mod();
    return res;
};

require.paths = [];
require.modules = {};
require.cache = {};
require.extensions = [".js",".coffee",".json"];

require._core = {
    'assert': true,
    'events': true,
    'fs': true,
    'path': true,
    'vm': true
};

require.resolve = (function () {
    return function (x, cwd) {
        if (!cwd) cwd = '/';
        
        if (require._core[x]) return x;
        var path = require.modules.path();
        cwd = path.resolve('/', cwd);
        var y = cwd || '/';
        
        if (x.match(/^(?:\.\.?\/|\/)/)) {
            var m = loadAsFileSync(path.resolve(y, x))
                || loadAsDirectorySync(path.resolve(y, x));
            if (m) return m;
        }
        
        var n = loadNodeModulesSync(x, y);
        if (n) return n;
        
        throw new Error("Cannot find module '" + x + "'");
        
        function loadAsFileSync (x) {
            x = path.normalize(x);
            if (require.modules[x]) {
                return x;
            }
            
            for (var i = 0; i < require.extensions.length; i++) {
                var ext = require.extensions[i];
                if (require.modules[x + ext]) return x + ext;
            }
        }
        
        function loadAsDirectorySync (x) {
            x = x.replace(/\/+$/, '');
            var pkgfile = path.normalize(x + '/package.json');
            if (require.modules[pkgfile]) {
                var pkg = require.modules[pkgfile]();
                var b = pkg.browserify;
                if (typeof b === 'object' && b.main) {
                    var m = loadAsFileSync(path.resolve(x, b.main));
                    if (m) return m;
                }
                else if (typeof b === 'string') {
                    var m = loadAsFileSync(path.resolve(x, b));
                    if (m) return m;
                }
                else if (pkg.main) {
                    var m = loadAsFileSync(path.resolve(x, pkg.main));
                    if (m) return m;
                }
            }
            
            return loadAsFileSync(x + '/index');
        }
        
        function loadNodeModulesSync (x, start) {
            var dirs = nodeModulesPathsSync(start);
            for (var i = 0; i < dirs.length; i++) {
                var dir = dirs[i];
                var m = loadAsFileSync(dir + '/' + x);
                if (m) return m;
                var n = loadAsDirectorySync(dir + '/' + x);
                if (n) return n;
            }
            
            var m = loadAsFileSync(x);
            if (m) return m;
        }
        
        function nodeModulesPathsSync (start) {
            var parts;
            if (start === '/') parts = [ '' ];
            else parts = path.normalize(start).split('/');
            
            var dirs = [];
            for (var i = parts.length - 1; i >= 0; i--) {
                if (parts[i] === 'node_modules') continue;
                var dir = parts.slice(0, i + 1).join('/') + '/node_modules';
                dirs.push(dir);
            }
            
            return dirs;
        }
    };
})();

require.alias = function (from, to) {
    var path = require.modules.path();
    var res = null;
    try {
        res = require.resolve(from + '/package.json', '/');
    }
    catch (err) {
        res = require.resolve(from, '/');
    }
    var basedir = path.dirname(res);
    
    var keys = (Object.keys || function (obj) {
        var res = [];
        for (var key in obj) res.push(key);
        return res;
    })(require.modules);
    
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (key.slice(0, basedir.length + 1) === basedir + '/') {
            var f = key.slice(basedir.length);
            require.modules[to + f] = require.modules[basedir + f];
        }
        else if (key === basedir) {
            require.modules[to] = require.modules[basedir];
        }
    }
};

(function () {
    var process = {};
    
    require.define = function (filename, fn) {
        if (require.modules.__browserify_process) {
            process = require.modules.__browserify_process();
        }
        
        var dirname = require._core[filename]
            ? ''
            : require.modules.path().dirname(filename)
        ;
        
        var require_ = function (file) {
            var requiredModule = require(file, dirname);
            var cached = require.cache[require.resolve(file, dirname)];

            if (cached && cached.parent === null) {
                cached.parent = module_;
            }

            return requiredModule;
        };
        require_.resolve = function (name) {
            return require.resolve(name, dirname);
        };
        require_.modules = require.modules;
        require_.define = require.define;
        require_.cache = require.cache;
        var module_ = {
            id : filename,
            filename: filename,
            exports : {},
            loaded : false,
            parent: null
        };
        
        require.modules[filename] = function () {
            require.cache[filename] = module_;
            fn.call(
                module_.exports,
                require_,
                module_,
                module_.exports,
                dirname,
                filename,
                process
            );
            module_.loaded = true;
            return module_.exports;
        };
    };
})();


require.define("path",function(require,module,exports,__dirname,__filename,process){function filter (xs, fn) {
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (fn(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length; i >= 0; i--) {
    var last = parts[i];
    if (last == '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Regex to split a filename into [*, dir, basename, ext]
// posix version
var splitPathRe = /^(.+\/(?!$)|\/)?((?:.+?)?(\.[^.]*)?)$/;

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
var resolvedPath = '',
    resolvedAbsolute = false;

for (var i = arguments.length; i >= -1 && !resolvedAbsolute; i--) {
  var path = (i >= 0)
      ? arguments[i]
      : process.cwd();

  // Skip empty and invalid entries
  if (typeof path !== 'string' || !path) {
    continue;
  }

  resolvedPath = path + '/' + resolvedPath;
  resolvedAbsolute = path.charAt(0) === '/';
}

// At this point the path should be resolved to a full absolute path, but
// handle relative paths to be safe (might happen when process.cwd() fails)

// Normalize the path
resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
var isAbsolute = path.charAt(0) === '/',
    trailingSlash = path.slice(-1) === '/';

// Normalize the path
path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }
  
  return (isAbsolute ? '/' : '') + path;
};


// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    return p && typeof p === 'string';
  }).join('/'));
};


exports.dirname = function(path) {
  var dir = splitPathRe.exec(path)[1] || '';
  var isWindows = false;
  if (!dir) {
    // No dirname
    return '.';
  } else if (dir.length === 1 ||
      (isWindows && dir.length <= 3 && dir.charAt(1) === ':')) {
    // It is just a slash or a drive letter with a slash
    return dir;
  } else {
    // It is a full dirname, strip trailing slash
    return dir.substring(0, dir.length - 1);
  }
};


exports.basename = function(path, ext) {
  var f = splitPathRe.exec(path)[2] || '';
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPathRe.exec(path)[3] || '';
};

});

require.define("__browserify_process",function(require,module,exports,__dirname,__filename,process){var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
        && window.setImmediate;
    var canPost = typeof window !== 'undefined'
        && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return window.setImmediate;
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            if (ev.source === window && ev.data === 'browserify-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('browserify-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

process.binding = function (name) {
    if (name === 'evals') return (require)('vm')
    else throw new Error('No such module. (Possibly not yet loaded)')
};

(function () {
    var cwd = '/';
    var path;
    process.cwd = function () { return cwd };
    process.chdir = function (dir) {
        if (!path) path = require('path');
        cwd = path.resolve(dir, cwd);
    };
})();

});

require.define("/node_modules/l10n/package.json",function(require,module,exports,__dirname,__filename,process){module.exports = {"main":"l10n.js"}
});

require.define("/node_modules/l10n/l10n.js",function(require,module,exports,__dirname,__filename,process){/** Copyright (c) 2011-2012 Fabien Cazenave, Mozilla.
  *
  * Permission is hereby granted, free of charge, to any person obtaining a copy
  * of this software and associated documentation files (the "Software"), to
  * deal in the Software without restriction, including without limitation the
  * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
  * sell copies of the Software, and to permit persons to whom the Software is
  * furnished to do so, subject to the following conditions:
  *
  * The above copyright notice and this permission notice shall be included in
  * all copies or substantial portions of the Software.
  *
  * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
  * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
  * IN THE SOFTWARE.
  */

/**
 * Modified for nodejs by Andrew Baxter <andy@highfellow.org>, Aug 2012
 **/

/*jshint browser: true, devel: true, es5: true, globalstrict: true */
'use strict';

var gL10nData = {};
var gTextData = '';
var gTextProp = 'textContent';
var gLanguage = '';
var gLoader = null; // resource loader function.
var gMacros = {};
var gReadyState = 'loading';

// read-only setting -- we recommend to load l10n resources synchronously
var gAsyncResourceLoading = true;

// debug helpers
var gDEBUG = false;
function consoleLog(message) {
  if (gDEBUG)
    console.log('[l10n] ' + message);
};
function consoleWarn(message) {
  if (gDEBUG)
    console.warn('[l10n] ' + message);
};

/**
 * l10n resource parser:
 *  - reads (async XHR) the l10n resource matching `lang';
 *  - imports linked resources (synchronously) when specified;
 *  - parses the text data (fills `gL10nData' and `gTextData');
 *  - triggers success/failure callbacks when done.
 *
 * @param {string} href
 *    URL of the l10n resource to parse.
 *
 * @param {string} lang
 *    locale (language) to parse.
 *
 * @param {Function} successCallback
 *    triggered when the l10n resource has been successully parsed.
 *
 * @param {Function} failureCallback
 *    triggered when the an error has occured.
 *
 * @return {void}
 *    uses the following global variables: gL10nData, gTextData, gTextProp.
 */

function parseResource(href, lang, successCallback, failureCallback) {
  var errors=false;

  // handle escaped characters (backslashes) in a string
  function evalString(text) {
    if (text.lastIndexOf('\\') < 0)
      return text;
    return text.replace(/\\\\/g, '\\')
               .replace(/\\n/g, '\n')
               .replace(/\\r/g, '\r')
               .replace(/\\t/g, '\t')
               .replace(/\\b/g, '\b')
               .replace(/\\f/g, '\f')
               .replace(/\\{/g, '{')
               .replace(/\\}/g, '}')
               .replace(/\\"/g, '"')
               .replace(/\\'/g, "'");
  }

  // parse *.properties text data into an l10n dictionary
  function parseProperties(text) {
    var dictionary = [];

    // token expressions
    var reBlank = /^\s*|\s*$/;
    var reComment = /^\s*#|^\s*$/;
    var reSection = /^\s*\[(.*)\]\s*$/;
    var reImport = /^\s*@import\s+url\((.*)\)\s*$/i;
    var reSplit = /^([^=\s]*)\s*=\s*(.+)$/; // TODO: escape EOLs with '\'

    // parse the *.properties file into an associative array
    function parseRawLines(rawText, extendedSyntax) {
      var entries = rawText.replace(reBlank, '').split(/[\r\n]+/);
      var currentLang = '*';
      var genericLang = lang.replace(/-[a-z]+$/i, '');
      var skipLang = false;
      var match = '';

      for (var i = 0; i < entries.length; i++) {
        var line = entries[i];

        // comment or blank line?
        if (reComment.test(line))
          continue;

        // the extended syntax supports [lang] sections and @import rules
        if (extendedSyntax) {
          if (reSection.test(line)) { // section start?
            match = reSection.exec(line);
            currentLang = match[1];
            skipLang = (currentLang !== '*') &&
                (currentLang !== lang) && (currentLang !== genericLang);
            continue;
          } else if (skipLang) {
            continue;
          }
          if (reImport.test(line)) { // @import rule?
            match = reImport.exec(line);
            loadImport(match[1]); // load the resource synchronously
          }
        }

        // key-value pair
        var tmp = line.match(reSplit);
        if (tmp && tmp.length == 3)
          dictionary[tmp[1]] = evalString(tmp[2]);
      }
    }

    // import another *.properties file
    function loadImport(url) {
      gLoader(url, function(content) {
        parseRawLines(content, false); // don't allow recursive imports
      }, function(err) {
        errors = true;
      }, false); // load synchronously
    }

    // fill the dictionary
    parseRawLines(text, true);
    return dictionary;
  }

  // load and parse l10n data (warning: global variables are used here)
  // uses the loader function gLoader which was defined in init(loader)
  gLoader(href, function(response) {
    gTextData += response; // mostly for debug

    // parse *.properties text data into an l10n dictionary
    var data = parseProperties(response);

    // find attribute descriptions, if any
    for (var key in data) {
      var id, prop, index = key.lastIndexOf('.');
      if (index > 0) { // an attribute has been specified
        id = key.substring(0, index);
        prop = key.substr(index + 1);
      } else { // no attribute: assuming text content by default
        id = key;
        prop = gTextProp;
      }
      if (!gL10nData[id]) {
        gL10nData[id] = {};
      }
      gL10nData[id][prop] = data[key];
    }
    
    if (!errors) {
      // trigger callback
      if (successCallback)
        successCallback();
    } else {
      if (failureCallback)
        failureCallback();
    }
  }, failureCallback, gAsyncResourceLoading);
};

// clear all l10n data
function clear() {
  gL10nData = {};
  gTextData = '';
  gLanguage = '';
  // TODO: clear all non predefined macros.
  // There's no such macro /yet/ but we're planning to have some...
}


/**
 * Get rules for plural forms (shared with JetPack), see:
 * http://unicode.org/repos/cldr-tmp/trunk/diff/supplemental/language_plural_rules.html
 * https://github.com/mozilla/addon-sdk/blob/master/python-lib/plural-rules-generator.p
 *
 * @param {string} lang
 *    locale (language) used.
 *
 * @return {Function}
 *    returns a function that gives the plural form name for a given integer:
 *       var fun = getPluralRules('en');
 *       fun(1)    -> 'one'
 *       fun(0)    -> 'other'
 *       fun(1000) -> 'other'.
 */

function getPluralRules(lang) {
  var locales2rules = {
    'af': 3,
    'ak': 4,
    'am': 4,
    'ar': 1,
    'asa': 3,
    'az': 0,
    'be': 11,
    'bem': 3,
    'bez': 3,
    'bg': 3,
    'bh': 4,
    'bm': 0,
    'bn': 3,
    'bo': 0,
    'br': 20,
    'brx': 3,
    'bs': 11,
    'ca': 3,
    'cgg': 3,
    'chr': 3,
    'cs': 12,
    'cy': 17,
    'da': 3,
    'de': 3,
    'dv': 3,
    'dz': 0,
    'ee': 3,
    'el': 3,
    'en': 3,
    'eo': 3,
    'es': 3,
    'et': 3,
    'eu': 3,
    'fa': 0,
    'ff': 5,
    'fi': 3,
    'fil': 4,
    'fo': 3,
    'fr': 5,
    'fur': 3,
    'fy': 3,
    'ga': 8,
    'gd': 24,
    'gl': 3,
    'gsw': 3,
    'gu': 3,
    'guw': 4,
    'gv': 23,
    'ha': 3,
    'haw': 3,
    'he': 2,
    'hi': 4,
    'hr': 11,
    'hu': 0,
    'id': 0,
    'ig': 0,
    'ii': 0,
    'is': 3,
    'it': 3,
    'iu': 7,
    'ja': 0,
    'jmc': 3,
    'jv': 0,
    'ka': 0,
    'kab': 5,
    'kaj': 3,
    'kcg': 3,
    'kde': 0,
    'kea': 0,
    'kk': 3,
    'kl': 3,
    'km': 0,
    'kn': 0,
    'ko': 0,
    'ksb': 3,
    'ksh': 21,
    'ku': 3,
    'kw': 7,
    'lag': 18,
    'lb': 3,
    'lg': 3,
    'ln': 4,
    'lo': 0,
    'lt': 10,
    'lv': 6,
    'mas': 3,
    'mg': 4,
    'mk': 16,
    'ml': 3,
    'mn': 3,
    'mo': 9,
    'mr': 3,
    'ms': 0,
    'mt': 15,
    'my': 0,
    'nah': 3,
    'naq': 7,
    'nb': 3,
    'nd': 3,
    'ne': 3,
    'nl': 3,
    'nn': 3,
    'no': 3,
    'nr': 3,
    'nso': 4,
    'ny': 3,
    'nyn': 3,
    'om': 3,
    'or': 3,
    'pa': 3,
    'pap': 3,
    'pl': 13,
    'ps': 3,
    'pt': 3,
    'rm': 3,
    'ro': 9,
    'rof': 3,
    'ru': 11,
    'rwk': 3,
    'sah': 0,
    'saq': 3,
    'se': 7,
    'seh': 3,
    'ses': 0,
    'sg': 0,
    'sh': 11,
    'shi': 19,
    'sk': 12,
    'sl': 14,
    'sma': 7,
    'smi': 7,
    'smj': 7,
    'smn': 7,
    'sms': 7,
    'sn': 3,
    'so': 3,
    'sq': 3,
    'sr': 11,
    'ss': 3,
    'ssy': 3,
    'st': 3,
    'sv': 3,
    'sw': 3,
    'syr': 3,
    'ta': 3,
    'te': 3,
    'teo': 3,
    'th': 0,
    'ti': 4,
    'tig': 3,
    'tk': 3,
    'tl': 4,
    'tn': 3,
    'to': 0,
    'tr': 0,
    'ts': 3,
    'tzm': 22,
    'uk': 11,
    'ur': 3,
    've': 3,
    'vi': 0,
    'vun': 3,
    'wa': 4,
    'wae': 3,
    'wo': 0,
    'xh': 3,
    'xog': 3,
    'yo': 0,
    'zh': 0,
    'zu': 3
  };

  // utility functions for plural rules methods
  function isIn(n, list) {
    return list.indexOf(n) !== -1;
  }
  function isBetween(n, start, end) {
    return start <= n && n <= end;
  }

  // list of all plural rules methods:
  // map an integer to the plural form name to use
  var pluralRules = {
    '0': function(n) {
      return 'other';
    },
    '1': function(n) {
      if ((isBetween((n % 100), 3, 10)))
        return 'few';
      if (n === 0)
        return 'zero';
      if ((isBetween((n % 100), 11, 99)))
        return 'many';
      if (n == 2)
        return 'two';
      if (n == 1)
        return 'one';
      return 'other';
    },
    '2': function(n) {
      if (n !== 0 && (n % 10) === 0)
        return 'many';
      if (n == 2)
        return 'two';
      if (n == 1)
        return 'one';
      return 'other';
    },
    '3': function(n) {
      if (n == 1)
        return 'one';
      return 'other';
    },
    '4': function(n) {
      if ((isBetween(n, 0, 1)))
        return 'one';
      return 'other';
    },
    '5': function(n) {
      if ((isBetween(n, 0, 2)) && n != 2)
        return 'one';
      return 'other';
    },
    '6': function(n) {
      if (n === 0)
        return 'zero';
      if ((n % 10) == 1 && (n % 100) != 11)
        return 'one';
      return 'other';
    },
    '7': function(n) {
      if (n == 2)
        return 'two';
      if (n == 1)
        return 'one';
      return 'other';
    },
    '8': function(n) {
      if ((isBetween(n, 3, 6)))
        return 'few';
      if ((isBetween(n, 7, 10)))
        return 'many';
      if (n == 2)
        return 'two';
      if (n == 1)
        return 'one';
      return 'other';
    },
    '9': function(n) {
      if (n === 0 || n != 1 && (isBetween((n % 100), 1, 19)))
        return 'few';
      if (n == 1)
        return 'one';
      return 'other';
    },
    '10': function(n) {
      if ((isBetween((n % 10), 2, 9)) && !(isBetween((n % 100), 11, 19)))
        return 'few';
      if ((n % 10) == 1 && !(isBetween((n % 100), 11, 19)))
        return 'one';
      return 'other';
    },
    '11': function(n) {
      if ((isBetween((n % 10), 2, 4)) && !(isBetween((n % 100), 12, 14)))
        return 'few';
      if ((n % 10) === 0 ||
          (isBetween((n % 10), 5, 9)) ||
          (isBetween((n % 100), 11, 14)))
        return 'many';
      if ((n % 10) == 1 && (n % 100) != 11)
        return 'one';
      return 'other';
    },
    '12': function(n) {
      if ((isBetween(n, 2, 4)))
        return 'few';
      if (n == 1)
        return 'one';
      return 'other';
    },
    '13': function(n) {
      if ((isBetween((n % 10), 2, 4)) && !(isBetween((n % 100), 12, 14)))
        return 'few';
      if (n != 1 && (isBetween((n % 10), 0, 1)) ||
          (isBetween((n % 10), 5, 9)) ||
          (isBetween((n % 100), 12, 14)))
        return 'many';
      if (n == 1)
        return 'one';
      return 'other';
    },
    '14': function(n) {
      if ((isBetween((n % 100), 3, 4)))
        return 'few';
      if ((n % 100) == 2)
        return 'two';
      if ((n % 100) == 1)
        return 'one';
      return 'other';
    },
    '15': function(n) {
      if (n === 0 || (isBetween((n % 100), 2, 10)))
        return 'few';
      if ((isBetween((n % 100), 11, 19)))
        return 'many';
      if (n == 1)
        return 'one';
      return 'other';
    },
    '16': function(n) {
      if ((n % 10) == 1 && n != 11)
        return 'one';
      return 'other';
    },
    '17': function(n) {
      if (n == 3)
        return 'few';
      if (n === 0)
        return 'zero';
      if (n == 6)
        return 'many';
      if (n == 2)
        return 'two';
      if (n == 1)
        return 'one';
      return 'other';
    },
    '18': function(n) {
      if (n === 0)
        return 'zero';
      if ((isBetween(n, 0, 2)) && n !== 0 && n != 2)
        return 'one';
      return 'other';
    },
    '19': function(n) {
      if ((isBetween(n, 2, 10)))
        return 'few';
      if ((isBetween(n, 0, 1)))
        return 'one';
      return 'other';
    },
    '20': function(n) {
      if ((isBetween((n % 10), 3, 4) || ((n % 10) == 9)) && !(
          isBetween((n % 100), 10, 19) ||
          isBetween((n % 100), 70, 79) ||
          isBetween((n % 100), 90, 99)
          ))
        return 'few';
      if ((n % 1000000) === 0 && n !== 0)
        return 'many';
      if ((n % 10) == 2 && !isIn((n % 100), [12, 72, 92]))
        return 'two';
      if ((n % 10) == 1 && !isIn((n % 100), [11, 71, 91]))
        return 'one';
      return 'other';
    },
    '21': function(n) {
      if (n === 0)
        return 'zero';
      if (n == 1)
        return 'one';
      return 'other';
    },
    '22': function(n) {
      if ((isBetween(n, 0, 1)) || (isBetween(n, 11, 99)))
        return 'one';
      return 'other';
    },
    '23': function(n) {
      if ((isBetween((n % 10), 1, 2)) || (n % 20) === 0)
        return 'one';
      return 'other';
    },
    '24': function(n) {
      if ((isBetween(n, 3, 10) || isBetween(n, 13, 19)))
        return 'few';
      if (isIn(n, [2, 12]))
        return 'two';
      if (isIn(n, [1, 11]))
        return 'one';
      return 'other';
    }
  };

  // return a function that gives the plural form name for a given integer
  var index = locales2rules[lang.replace(/-.*$/, '')];
  if (!(index in pluralRules)) {
    consoleWarn('plural form unknown for [' + lang + ']');
    return function() { return 'other'; };
  }
  return pluralRules[index];
}

// pre-defined 'plural' macro
gMacros.plural = function(str, param, key, prop) {
  var n = parseFloat(param);
  if (isNaN(n))
    return str;

  // TODO: support other properties (l20n still doesn't...)
  if (prop != gTextProp)
    return str;

  // initialize _pluralRules
  if (!gMacros._pluralRules)
    gMacros._pluralRules = getPluralRules(gLanguage);
  var index = '[' + gMacros._pluralRules(n) + ']';

  // try to find a [zero|one|two] key if it's defined
  if (n === 0 && (key + '[zero]') in gL10nData) {
    str = gL10nData[key + '[zero]'][prop];
  } else if (n == 1 && (key + '[one]') in gL10nData) {
    str = gL10nData[key + '[one]'][prop];
  } else if (n == 2 && (key + '[two]') in gL10nData) {
    str = gL10nData[key + '[two]'][prop];
  } else if ((key + index) in gL10nData) {
    str = gL10nData[key + index][prop];
  }

  return str;
};


/**
 * l10n dictionary functions
 */

// fetch an l10n object, warn if not found, apply `args' if possible
function getL10nData(key, args) {
  var data = gL10nData[key];
  if (!data) {
    consoleWarn('#' + key + ' missing for [' + gLanguage + ']');
  }

  /** This is where l10n expressions should be processed.
    * The plan is to support C-style expressions from the l20n project;
    * until then, only two kinds of simple expressions are supported:
    *   {[ index ]} and {{ arguments }}.
    */
  var rv = {};
  for (var prop in data) {
    var str = data[prop];
    str = substIndexes(str, args, key, prop);
    str = substArguments(str, args);
    rv[prop] = str;
  }
  return rv;
}

// replace {[macros]} with their values
function substIndexes(str, args, key, prop) {
  var reIndex = /\{\[\s*([a-zA-Z]+)\(([a-zA-Z]+)\)\s*\]\}/;
  var reMatch = reIndex.exec(str);
  if (!reMatch || !reMatch.length)
    return str;

  // an index/macro has been found
  // Note: at the moment, only one parameter is supported
  var macroName = reMatch[1];
  var paramName = reMatch[2];
  var param;
  if (args && paramName in args) {
    param = args[paramName];
  } else if (paramName in gL10nData) {
    param = gL10nData[paramName];
  }

  // there's no macro parser yet: it has to be defined in gMacros
  if (macroName in gMacros) {
    var macro = gMacros[macroName];
    str = macro(str, param, key, prop);
  }
  return str;
}

// replace {{arguments}} with their values
function substArguments(str, args) {
  var reArgs = /\{\{\s*([a-zA-Z\.]+)\s*\}\}/;
  var match = reArgs.exec(str);
  while (match) {
    if (!match || match.length < 2)
      return str; // argument key not found

    var arg = match[1];
    var sub = '';
    if (arg in args) {
      sub = args[arg];
    } else if (arg in gL10nData) {
      sub = gL10nData[arg][gTextProp];
    } else {
      consoleWarn('could not find argument {{' + arg + '}}');
      return str;
    }

    str = str.substring(0, match.index) + sub +
          str.substr(match.index + match[0].length);
    match = reArgs.exec(str);
  }
  return str;
}

function L10n(adapter) {
  // Function object for handling translation API.
  // TODO - could move the global variables into this object.

  // load a resource for a given language from a relative path the loader understands.
  // arguments: 
  // path - a relative path.
  // lang - language to load from the resource.
  // successCallback - called once a language has been loaded.
  // failureCallback - called if loading fails.
  this.loadResource = parseResource;
  this.get = function(key,args,fallback) {
    var data = getL10nData(key, args) || fallback;
    if (data) { // XXX double-check this
      return 'textContent' in data ? data.textContent : '';
    }
    return '{{' + key + '}}';
  };
  this.getData = function() { return gL10nData;};
  this.getText = function() { return gTextData;};
  // get the direction (ltr|rtl) of the current language
  this.getDirection = function() {
    // http://www.w3.org/International/questions/qa-scripts
    // Arabic, Hebrew, Farsi, Pashto, Urdu
    var rtlList = ['ar', 'he', 'fa', 'ps', 'ur'];
    return (rtlList.indexOf(gLanguage) >= 0) ? 'rtl' : 'ltr';
  };
  // TODO - is getReadyState needed without the browser code?
  this.getReadyState = function() { return gReadyState; };
  gLoader = adapter.getLoader();
}

// export the L10n function object as the API.
module.exports = L10n;

});

require.define("/package.json",function(require,module,exports,__dirname,__filename,process){module.exports = {"main":"l10n-browser.js"}
});

require.define("/l10n-browser.js",function(require,module,exports,__dirname,__filename,process){/**
 * file adapter for node-l10n.
 * (C) 2012 Andrew Baxter <andy@highfellow.org>
 **/

url = require('url');

function L10n_Browser(baseURL) {
  // a class which l10n can use to get the resource loader.
  // baseURL is optionally a non-standard base URL to use when retrieving resources from relative paths.
  this.getLoader = function() {
    return(function(path, success, failure, async) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', path, async);
      if (xhr.overrideMimeType) {
        xhr.overrideMimeType('text/plain; charset=utf-8');
      }
      xhr.onreadystatechange = function() {
        if (xhr.readyState == 4) {
          if (xhr.status == 200 || xhr.status === 0) {
            if (success)
              success(xhr.responseText);
          } else {
              if (failure)
                failure();
          }
        }
      };
      xhr.send(null);
    });
  }
  if (baseURL !== undefined) {
    this.baseURL = baseURL;
  } else {
    this.baseURL = ''; // base URL defaults to the current document path.
  }
}

module.exports = L10n_Browser;

});

require.define("url",function(require,module,exports,__dirname,__filename,process){var punycode = { encode : function (s) { return s } };

exports.parse = urlParse;
exports.resolve = urlResolve;
exports.resolveObject = urlResolveObject;
exports.format = urlFormat;

function arrayIndexOf(array, subject) {
    for (var i = 0, j = array.length; i < j; i++) {
        if(array[i] == subject) return i;
    }
    return -1;
}

var objectKeys = Object.keys || function objectKeys(object) {
    if (object !== Object(object)) throw new TypeError('Invalid object');
    var keys = [];
    for (var key in object) if (object.hasOwnProperty(key)) keys[keys.length] = key;
    return keys;
}

// Reference: RFC 3986, RFC 1808, RFC 2396

// define these here so at least they only have to be
// compiled once on the first module load.
var protocolPattern = /^([a-z0-9.+-]+:)/i,
    portPattern = /:[0-9]+$/,
    // RFC 2396: characters reserved for delimiting URLs.
    delims = ['<', '>', '"', '`', ' ', '\r', '\n', '\t'],
    // RFC 2396: characters not allowed for various reasons.
    unwise = ['{', '}', '|', '\\', '^', '~', '[', ']', '`'].concat(delims),
    // Allowed by RFCs, but cause of XSS attacks.  Always escape these.
    autoEscape = ['\''],
    // Characters that are never ever allowed in a hostname.
    // Note that any invalid chars are also handled, but these
    // are the ones that are *expected* to be seen, so we fast-path
    // them.
    nonHostChars = ['%', '/', '?', ';', '#']
      .concat(unwise).concat(autoEscape),
    nonAuthChars = ['/', '@', '?', '#'].concat(delims),
    hostnameMaxLen = 255,
    hostnamePartPattern = /^[a-zA-Z0-9][a-z0-9A-Z_-]{0,62}$/,
    hostnamePartStart = /^([a-zA-Z0-9][a-z0-9A-Z_-]{0,62})(.*)$/,
    // protocols that can allow "unsafe" and "unwise" chars.
    unsafeProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that never have a hostname.
    hostlessProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that always have a path component.
    pathedProtocol = {
      'http': true,
      'https': true,
      'ftp': true,
      'gopher': true,
      'file': true,
      'http:': true,
      'ftp:': true,
      'gopher:': true,
      'file:': true
    },
    // protocols that always contain a // bit.
    slashedProtocol = {
      'http': true,
      'https': true,
      'ftp': true,
      'gopher': true,
      'file': true,
      'http:': true,
      'https:': true,
      'ftp:': true,
      'gopher:': true,
      'file:': true
    },
    querystring = require('querystring');

function urlParse(url, parseQueryString, slashesDenoteHost) {
  if (url && typeof(url) === 'object' && url.href) return url;

  if (typeof url !== 'string') {
    throw new TypeError("Parameter 'url' must be a string, not " + typeof url);
  }

  var out = {},
      rest = url;

  // cut off any delimiters.
  // This is to support parse stuff like "<http://foo.com>"
  for (var i = 0, l = rest.length; i < l; i++) {
    if (arrayIndexOf(delims, rest.charAt(i)) === -1) break;
  }
  if (i !== 0) rest = rest.substr(i);


  var proto = protocolPattern.exec(rest);
  if (proto) {
    proto = proto[0];
    var lowerProto = proto.toLowerCase();
    out.protocol = lowerProto;
    rest = rest.substr(proto.length);
  }

  // figure out if it's got a host
  // user@server is *always* interpreted as a hostname, and url
  // resolution will treat //foo/bar as host=foo,path=bar because that's
  // how the browser resolves relative URLs.
  if (slashesDenoteHost || proto || rest.match(/^\/\/[^@\/]+@[^@\/]+/)) {
    var slashes = rest.substr(0, 2) === '//';
    if (slashes && !(proto && hostlessProtocol[proto])) {
      rest = rest.substr(2);
      out.slashes = true;
    }
  }

  if (!hostlessProtocol[proto] &&
      (slashes || (proto && !slashedProtocol[proto]))) {
    // there's a hostname.
    // the first instance of /, ?, ;, or # ends the host.
    // don't enforce full RFC correctness, just be unstupid about it.

    // If there is an @ in the hostname, then non-host chars *are* allowed
    // to the left of the first @ sign, unless some non-auth character
    // comes *before* the @-sign.
    // URLs are obnoxious.
    var atSign = arrayIndexOf(rest, '@');
    if (atSign !== -1) {
      // there *may be* an auth
      var hasAuth = true;
      for (var i = 0, l = nonAuthChars.length; i < l; i++) {
        var index = arrayIndexOf(rest, nonAuthChars[i]);
        if (index !== -1 && index < atSign) {
          // not a valid auth.  Something like http://foo.com/bar@baz/
          hasAuth = false;
          break;
        }
      }
      if (hasAuth) {
        // pluck off the auth portion.
        out.auth = rest.substr(0, atSign);
        rest = rest.substr(atSign + 1);
      }
    }

    var firstNonHost = -1;
    for (var i = 0, l = nonHostChars.length; i < l; i++) {
      var index = arrayIndexOf(rest, nonHostChars[i]);
      if (index !== -1 &&
          (firstNonHost < 0 || index < firstNonHost)) firstNonHost = index;
    }

    if (firstNonHost !== -1) {
      out.host = rest.substr(0, firstNonHost);
      rest = rest.substr(firstNonHost);
    } else {
      out.host = rest;
      rest = '';
    }

    // pull out port.
    var p = parseHost(out.host);
    var keys = objectKeys(p);
    for (var i = 0, l = keys.length; i < l; i++) {
      var key = keys[i];
      out[key] = p[key];
    }

    // we've indicated that there is a hostname,
    // so even if it's empty, it has to be present.
    out.hostname = out.hostname || '';

    // validate a little.
    if (out.hostname.length > hostnameMaxLen) {
      out.hostname = '';
    } else {
      var hostparts = out.hostname.split(/\./);
      for (var i = 0, l = hostparts.length; i < l; i++) {
        var part = hostparts[i];
        if (!part) continue;
        if (!part.match(hostnamePartPattern)) {
          var newpart = '';
          for (var j = 0, k = part.length; j < k; j++) {
            if (part.charCodeAt(j) > 127) {
              // we replace non-ASCII char with a temporary placeholder
              // we need this to make sure size of hostname is not
              // broken by replacing non-ASCII by nothing
              newpart += 'x';
            } else {
              newpart += part[j];
            }
          }
          // we test again with ASCII char only
          if (!newpart.match(hostnamePartPattern)) {
            var validParts = hostparts.slice(0, i);
            var notHost = hostparts.slice(i + 1);
            var bit = part.match(hostnamePartStart);
            if (bit) {
              validParts.push(bit[1]);
              notHost.unshift(bit[2]);
            }
            if (notHost.length) {
              rest = '/' + notHost.join('.') + rest;
            }
            out.hostname = validParts.join('.');
            break;
          }
        }
      }
    }

    // hostnames are always lower case.
    out.hostname = out.hostname.toLowerCase();

    // IDNA Support: Returns a puny coded representation of "domain".
    // It only converts the part of the domain name that
    // has non ASCII characters. I.e. it dosent matter if
    // you call it with a domain that already is in ASCII.
    var domainArray = out.hostname.split('.');
    var newOut = [];
    for (var i = 0; i < domainArray.length; ++i) {
      var s = domainArray[i];
      newOut.push(s.match(/[^A-Za-z0-9_-]/) ?
          'xn--' + punycode.encode(s) : s);
    }
    out.hostname = newOut.join('.');

    out.host = (out.hostname || '') +
        ((out.port) ? ':' + out.port : '');
    out.href += out.host;
  }

  // now rest is set to the post-host stuff.
  // chop off any delim chars.
  if (!unsafeProtocol[lowerProto]) {

    // First, make 100% sure that any "autoEscape" chars get
    // escaped, even if encodeURIComponent doesn't think they
    // need to be.
    for (var i = 0, l = autoEscape.length; i < l; i++) {
      var ae = autoEscape[i];
      var esc = encodeURIComponent(ae);
      if (esc === ae) {
        esc = escape(ae);
      }
      rest = rest.split(ae).join(esc);
    }

    // Now make sure that delims never appear in a url.
    var chop = rest.length;
    for (var i = 0, l = delims.length; i < l; i++) {
      var c = arrayIndexOf(rest, delims[i]);
      if (c !== -1) {
        chop = Math.min(c, chop);
      }
    }
    rest = rest.substr(0, chop);
  }


  // chop off from the tail first.
  var hash = arrayIndexOf(rest, '#');
  if (hash !== -1) {
    // got a fragment string.
    out.hash = rest.substr(hash);
    rest = rest.slice(0, hash);
  }
  var qm = arrayIndexOf(rest, '?');
  if (qm !== -1) {
    out.search = rest.substr(qm);
    out.query = rest.substr(qm + 1);
    if (parseQueryString) {
      out.query = querystring.parse(out.query);
    }
    rest = rest.slice(0, qm);
  } else if (parseQueryString) {
    // no query string, but parseQueryString still requested
    out.search = '';
    out.query = {};
  }
  if (rest) out.pathname = rest;
  if (slashedProtocol[proto] &&
      out.hostname && !out.pathname) {
    out.pathname = '/';
  }

  //to support http.request
  if (out.pathname || out.search) {
    out.path = (out.pathname ? out.pathname : '') +
               (out.search ? out.search : '');
  }

  // finally, reconstruct the href based on what has been validated.
  out.href = urlFormat(out);
  return out;
}

// format a parsed object into a url string
function urlFormat(obj) {
  // ensure it's an object, and not a string url.
  // If it's an obj, this is a no-op.
  // this way, you can call url_format() on strings
  // to clean up potentially wonky urls.
  if (typeof(obj) === 'string') obj = urlParse(obj);

  var auth = obj.auth || '';
  if (auth) {
    auth = auth.split('@').join('%40');
    for (var i = 0, l = nonAuthChars.length; i < l; i++) {
      var nAC = nonAuthChars[i];
      auth = auth.split(nAC).join(encodeURIComponent(nAC));
    }
    auth += '@';
  }

  var protocol = obj.protocol || '',
      host = (obj.host !== undefined) ? auth + obj.host :
          obj.hostname !== undefined ? (
              auth + obj.hostname +
              (obj.port ? ':' + obj.port : '')
          ) :
          false,
      pathname = obj.pathname || '',
      query = obj.query &&
              ((typeof obj.query === 'object' &&
                objectKeys(obj.query).length) ?
                 querystring.stringify(obj.query) :
                 '') || '',
      search = obj.search || (query && ('?' + query)) || '',
      hash = obj.hash || '';

  if (protocol && protocol.substr(-1) !== ':') protocol += ':';

  // only the slashedProtocols get the //.  Not mailto:, xmpp:, etc.
  // unless they had them to begin with.
  if (obj.slashes ||
      (!protocol || slashedProtocol[protocol]) && host !== false) {
    host = '//' + (host || '');
    if (pathname && pathname.charAt(0) !== '/') pathname = '/' + pathname;
  } else if (!host) {
    host = '';
  }

  if (hash && hash.charAt(0) !== '#') hash = '#' + hash;
  if (search && search.charAt(0) !== '?') search = '?' + search;

  return protocol + host + pathname + search + hash;
}

function urlResolve(source, relative) {
  return urlFormat(urlResolveObject(source, relative));
}

function urlResolveObject(source, relative) {
  if (!source) return relative;

  source = urlParse(urlFormat(source), false, true);
  relative = urlParse(urlFormat(relative), false, true);

  // hash is always overridden, no matter what.
  source.hash = relative.hash;

  if (relative.href === '') {
    source.href = urlFormat(source);
    return source;
  }

  // hrefs like //foo/bar always cut to the protocol.
  if (relative.slashes && !relative.protocol) {
    relative.protocol = source.protocol;
    //urlParse appends trailing / to urls like http://www.example.com
    if (slashedProtocol[relative.protocol] &&
        relative.hostname && !relative.pathname) {
      relative.path = relative.pathname = '/';
    }
    relative.href = urlFormat(relative);
    return relative;
  }

  if (relative.protocol && relative.protocol !== source.protocol) {
    // if it's a known url protocol, then changing
    // the protocol does weird things
    // first, if it's not file:, then we MUST have a host,
    // and if there was a path
    // to begin with, then we MUST have a path.
    // if it is file:, then the host is dropped,
    // because that's known to be hostless.
    // anything else is assumed to be absolute.
    if (!slashedProtocol[relative.protocol]) {
      relative.href = urlFormat(relative);
      return relative;
    }
    source.protocol = relative.protocol;
    if (!relative.host && !hostlessProtocol[relative.protocol]) {
      var relPath = (relative.pathname || '').split('/');
      while (relPath.length && !(relative.host = relPath.shift()));
      if (!relative.host) relative.host = '';
      if (!relative.hostname) relative.hostname = '';
      if (relPath[0] !== '') relPath.unshift('');
      if (relPath.length < 2) relPath.unshift('');
      relative.pathname = relPath.join('/');
    }
    source.pathname = relative.pathname;
    source.search = relative.search;
    source.query = relative.query;
    source.host = relative.host || '';
    source.auth = relative.auth;
    source.hostname = relative.hostname || relative.host;
    source.port = relative.port;
    //to support http.request
    if (source.pathname !== undefined || source.search !== undefined) {
      source.path = (source.pathname ? source.pathname : '') +
                    (source.search ? source.search : '');
    }
    source.slashes = source.slashes || relative.slashes;
    source.href = urlFormat(source);
    return source;
  }

  var isSourceAbs = (source.pathname && source.pathname.charAt(0) === '/'),
      isRelAbs = (
          relative.host !== undefined ||
          relative.pathname && relative.pathname.charAt(0) === '/'
      ),
      mustEndAbs = (isRelAbs || isSourceAbs ||
                    (source.host && relative.pathname)),
      removeAllDots = mustEndAbs,
      srcPath = source.pathname && source.pathname.split('/') || [],
      relPath = relative.pathname && relative.pathname.split('/') || [],
      psychotic = source.protocol &&
          !slashedProtocol[source.protocol];

  // if the url is a non-slashed url, then relative
  // links like ../.. should be able
  // to crawl up to the hostname, as well.  This is strange.
  // source.protocol has already been set by now.
  // Later on, put the first path part into the host field.
  if (psychotic) {

    delete source.hostname;
    delete source.port;
    if (source.host) {
      if (srcPath[0] === '') srcPath[0] = source.host;
      else srcPath.unshift(source.host);
    }
    delete source.host;
    if (relative.protocol) {
      delete relative.hostname;
      delete relative.port;
      if (relative.host) {
        if (relPath[0] === '') relPath[0] = relative.host;
        else relPath.unshift(relative.host);
      }
      delete relative.host;
    }
    mustEndAbs = mustEndAbs && (relPath[0] === '' || srcPath[0] === '');
  }

  if (isRelAbs) {
    // it's absolute.
    source.host = (relative.host || relative.host === '') ?
                      relative.host : source.host;
    source.hostname = (relative.hostname || relative.hostname === '') ?
                      relative.hostname : source.hostname;
    source.search = relative.search;
    source.query = relative.query;
    srcPath = relPath;
    // fall through to the dot-handling below.
  } else if (relPath.length) {
    // it's relative
    // throw away the existing file, and take the new path instead.
    if (!srcPath) srcPath = [];
    srcPath.pop();
    srcPath = srcPath.concat(relPath);
    source.search = relative.search;
    source.query = relative.query;
  } else if ('search' in relative) {
    // just pull out the search.
    // like href='?foo'.
    // Put this after the other two cases because it simplifies the booleans
    if (psychotic) {
      source.hostname = source.host = srcPath.shift();
      //occationaly the auth can get stuck only in host
      //this especialy happens in cases like
      //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
      var authInHost = source.host && arrayIndexOf(source.host, '@') > 0 ?
                       source.host.split('@') : false;
      if (authInHost) {
        source.auth = authInHost.shift();
        source.host = source.hostname = authInHost.shift();
      }
    }
    source.search = relative.search;
    source.query = relative.query;
    //to support http.request
    if (source.pathname !== undefined || source.search !== undefined) {
      source.path = (source.pathname ? source.pathname : '') +
                    (source.search ? source.search : '');
    }
    source.href = urlFormat(source);
    return source;
  }
  if (!srcPath.length) {
    // no path at all.  easy.
    // we've already handled the other stuff above.
    delete source.pathname;
    //to support http.request
    if (!source.search) {
      source.path = '/' + source.search;
    } else {
      delete source.path;
    }
    source.href = urlFormat(source);
    return source;
  }
  // if a url ENDs in . or .., then it must get a trailing slash.
  // however, if it ends in anything else non-slashy,
  // then it must NOT get a trailing slash.
  var last = srcPath.slice(-1)[0];
  var hasTrailingSlash = (
      (source.host || relative.host) && (last === '.' || last === '..') ||
      last === '');

  // strip single dots, resolve double dots to parent dir
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = srcPath.length; i >= 0; i--) {
    last = srcPath[i];
    if (last == '.') {
      srcPath.splice(i, 1);
    } else if (last === '..') {
      srcPath.splice(i, 1);
      up++;
    } else if (up) {
      srcPath.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (!mustEndAbs && !removeAllDots) {
    for (; up--; up) {
      srcPath.unshift('..');
    }
  }

  if (mustEndAbs && srcPath[0] !== '' &&
      (!srcPath[0] || srcPath[0].charAt(0) !== '/')) {
    srcPath.unshift('');
  }

  if (hasTrailingSlash && (srcPath.join('/').substr(-1) !== '/')) {
    srcPath.push('');
  }

  var isAbsolute = srcPath[0] === '' ||
      (srcPath[0] && srcPath[0].charAt(0) === '/');

  // put the host back
  if (psychotic) {
    source.hostname = source.host = isAbsolute ? '' :
                                    srcPath.length ? srcPath.shift() : '';
    //occationaly the auth can get stuck only in host
    //this especialy happens in cases like
    //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
    var authInHost = source.host && arrayIndexOf(source.host, '@') > 0 ?
                     source.host.split('@') : false;
    if (authInHost) {
      source.auth = authInHost.shift();
      source.host = source.hostname = authInHost.shift();
    }
  }

  mustEndAbs = mustEndAbs || (source.host && srcPath.length);

  if (mustEndAbs && !isAbsolute) {
    srcPath.unshift('');
  }

  source.pathname = srcPath.join('/');
  //to support request.http
  if (source.pathname !== undefined || source.search !== undefined) {
    source.path = (source.pathname ? source.pathname : '') +
                  (source.search ? source.search : '');
  }
  source.auth = relative.auth || source.auth;
  source.slashes = source.slashes || relative.slashes;
  source.href = urlFormat(source);
  return source;
}

function parseHost(host) {
  var out = {};
  var port = portPattern.exec(host);
  if (port) {
    port = port[0];
    out.port = port.substr(1);
    host = host.substr(0, host.length - port.length);
  }
  if (host) out.hostname = host;
  return out;
}

});

require.define("querystring",function(require,module,exports,__dirname,__filename,process){var isArray = typeof Array.isArray === 'function'
    ? Array.isArray
    : function (xs) {
        return Object.prototype.toString.call(xs) === '[object Array]'
    };

var objectKeys = Object.keys || function objectKeys(object) {
    if (object !== Object(object)) throw new TypeError('Invalid object');
    var keys = [];
    for (var key in object) if (object.hasOwnProperty(key)) keys[keys.length] = key;
    return keys;
}


/*!
 * querystring
 * Copyright(c) 2010 TJ Holowaychuk <tj@vision-media.ca>
 * MIT Licensed
 */

/**
 * Library version.
 */

exports.version = '0.3.1';

/**
 * Object#toString() ref for stringify().
 */

var toString = Object.prototype.toString;

/**
 * Cache non-integer test regexp.
 */

var notint = /[^0-9]/;

/**
 * Parse the given query `str`, returning an object.
 *
 * @param {String} str
 * @return {Object}
 * @api public
 */

exports.parse = function(str){
  if (null == str || '' == str) return {};

  function promote(parent, key) {
    if (parent[key].length == 0) return parent[key] = {};
    var t = {};
    for (var i in parent[key]) t[i] = parent[key][i];
    parent[key] = t;
    return t;
  }

  return String(str)
    .split('&')
    .reduce(function(ret, pair){
      try{ 
        pair = decodeURIComponent(pair.replace(/\+/g, ' '));
      } catch(e) {
        // ignore
      }

      var eql = pair.indexOf('=')
        , brace = lastBraceInKey(pair)
        , key = pair.substr(0, brace || eql)
        , val = pair.substr(brace || eql, pair.length)
        , val = val.substr(val.indexOf('=') + 1, val.length)
        , parent = ret;

      // ?foo
      if ('' == key) key = pair, val = '';

      // nested
      if (~key.indexOf(']')) {
        var parts = key.split('[')
          , len = parts.length
          , last = len - 1;

        function parse(parts, parent, key) {
          var part = parts.shift();

          // end
          if (!part) {
            if (isArray(parent[key])) {
              parent[key].push(val);
            } else if ('object' == typeof parent[key]) {
              parent[key] = val;
            } else if ('undefined' == typeof parent[key]) {
              parent[key] = val;
            } else {
              parent[key] = [parent[key], val];
            }
          // array
          } else {
            obj = parent[key] = parent[key] || [];
            if (']' == part) {
              if (isArray(obj)) {
                if ('' != val) obj.push(val);
              } else if ('object' == typeof obj) {
                obj[objectKeys(obj).length] = val;
              } else {
                obj = parent[key] = [parent[key], val];
              }
            // prop
            } else if (~part.indexOf(']')) {
              part = part.substr(0, part.length - 1);
              if(notint.test(part) && isArray(obj)) obj = promote(parent, key);
              parse(parts, obj, part);
            // key
            } else {
              if(notint.test(part) && isArray(obj)) obj = promote(parent, key);
              parse(parts, obj, part);
            }
          }
        }

        parse(parts, parent, 'base');
      // optimize
      } else {
        if (notint.test(key) && isArray(parent.base)) {
          var t = {};
          for(var k in parent.base) t[k] = parent.base[k];
          parent.base = t;
        }
        set(parent.base, key, val);
      }

      return ret;
    }, {base: {}}).base;
};

/**
 * Turn the given `obj` into a query string
 *
 * @param {Object} obj
 * @return {String}
 * @api public
 */

var stringify = exports.stringify = function(obj, prefix) {
  if (isArray(obj)) {
    return stringifyArray(obj, prefix);
  } else if ('[object Object]' == toString.call(obj)) {
    return stringifyObject(obj, prefix);
  } else if ('string' == typeof obj) {
    return stringifyString(obj, prefix);
  } else {
    return prefix;
  }
};

/**
 * Stringify the given `str`.
 *
 * @param {String} str
 * @param {String} prefix
 * @return {String}
 * @api private
 */

function stringifyString(str, prefix) {
  if (!prefix) throw new TypeError('stringify expects an object');
  return prefix + '=' + encodeURIComponent(str);
}

/**
 * Stringify the given `arr`.
 *
 * @param {Array} arr
 * @param {String} prefix
 * @return {String}
 * @api private
 */

function stringifyArray(arr, prefix) {
  var ret = [];
  if (!prefix) throw new TypeError('stringify expects an object');
  for (var i = 0; i < arr.length; i++) {
    ret.push(stringify(arr[i], prefix + '[]'));
  }
  return ret.join('&');
}

/**
 * Stringify the given `obj`.
 *
 * @param {Object} obj
 * @param {String} prefix
 * @return {String}
 * @api private
 */

function stringifyObject(obj, prefix) {
  var ret = []
    , keys = objectKeys(obj)
    , key;
  for (var i = 0, len = keys.length; i < len; ++i) {
    key = keys[i];
    ret.push(stringify(obj[key], prefix
      ? prefix + '[' + encodeURIComponent(key) + ']'
      : encodeURIComponent(key)));
  }
  return ret.join('&');
}

/**
 * Set `obj`'s `key` to `val` respecting
 * the weird and wonderful syntax of a qs,
 * where "foo=bar&foo=baz" becomes an array.
 *
 * @param {Object} obj
 * @param {String} key
 * @param {String} val
 * @api private
 */

function set(obj, key, val) {
  var v = obj[key];
  if (undefined === v) {
    obj[key] = val;
  } else if (isArray(v)) {
    v.push(val);
  } else {
    obj[key] = [v, val];
  }
}

/**
 * Locate last brace in `str` within the key.
 *
 * @param {String} str
 * @return {Number}
 * @api private
 */

function lastBraceInKey(str) {
  var len = str.length
    , brace
    , c;
  for (var i = 0; i < len; ++i) {
    c = str[i];
    if (']' == c) brace = false;
    if ('[' == c) brace = true;
    if ('=' == c && !brace) return i;
  }
}

});

require.define("/example/example.js",function(require,module,exports,__dirname,__filename,process){/**
 *  Test code for node-l10n.
 **/

var L10n = require('l10n');
var L10n_Browser = require('../l10n-browser.js');
var outputElt = null; // element to write output into.

function appendElt(elt, type, content) {
  // add an element to elt and fill it.
  var newElt = document.createElement(type);
  newElt.textContent = content;
  elt.appendChild(newElt);
  return(newElt);
}

// run through plurals using a given adjective.
function repeat(elt,adjKey) {
  var adj;
  for (var n = 0; n < 4; n++) {
    adj=l10n.get(adjKey, {'n':n}, 'colour');
    appendElt(elt,'li',l10n.get('phrase',{'n':n, 'adj':adj}, 'brown fox phrase'));
  }
}

// test in a given language.
function testLanguage(lang, callback) {
  var h2 = appendElt(outputElt, 'h2', 'Language:' + lang)
  l10n.loadResource('data.properties', lang, function() {
    var h3 = appendElt(h2, 'h3', 'Usual version');
    var p = appendElt(h2, 'p', '');
    var ul = appendElt(p, 'ul', '');
    repeat(ul, 'brown');
    h3 = appendElt(h2, 'h3', 'With parameter substitution');
    p = appendElt(h2, 'p', '');
    ul = appendElt(p, 'ul', '');
    repeat(ul, 'pink');
    callback && callback();
  },
  function(err) {
    console.log('Failed to load data.properties');
  });
}

window.onload = function() {
  outputElt = document.getElementById('output'); 
  // do the tests.
  testLanguage('en', function() {
    testLanguage('de');
  });
}

// initialise L10n with the file adapter.
var l10n = new L10n(new L10n_Browser());


});
require("/example/example.js");
})();
