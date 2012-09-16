/**
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

