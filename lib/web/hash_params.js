
var listeners = [];

function listen(callback) {

  function readParameters() {
    var parameters = {};
    window.location.hash.slice(1).split('&').forEach(function(pair) {
      var keyValue = pair.split('=');
      if (keyValue[1]) {
        parameters[decodeURIComponent(keyValue[0])] =
            decodeURIComponent(keyValue[1]);
      }
    });
    return parameters;
  }

  listeners.push(callback);
  callback(readParameters());

  if (listeners.length === 1) {
    $(window).on('hashchange', function() {
      listeners.forEach(function(listener) {
        listener(readParameters());
      });
    });
  }
}

function update(values) {
  window.location.hash = Object.keys(values).map(function(key) {
    return encodeURIComponent(key) + '=' + encodeURIComponent(values[key]);
  }).join('&');
}


exports.listen = listen;
exports.update = update;

