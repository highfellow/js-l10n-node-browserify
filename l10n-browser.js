/**
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
