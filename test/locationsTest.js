/**
 * Modules for tests
 */
/* jshint unused: false */
var nodeunit = require('nodeunit'),
    http = require('http'),
    util = require('util'),
    remote = process.env.TEST_REMOTE === 'true';

if(!remote){
  var locations = require('../lib/locations');
}

exports.testcase = {
  setUp: function (callback) {
    //set up
    console.log("startUp");
    if(!remote){
      locations.start(function(){setTimeout(callback,1000)});
    }else{
      callback();
    }
  },
  tearDown: function (callback) {
    //cleanup
    console.log("tearDown");
    if(!remote){
      locations.stop(callback);
    }else{
      callback();
    }
  },
  
  testSomething: function (test) {
    test.expect(1);
    test.ok(true, "Test should pass");
    test.done();
  },
  testGetRequest: function (test) {
    test.expect(1);
    
    var options = { "hostname": (process.env.TEST_ROUTE || "localhost"),
          "port" :  (process.env.TEST_PORT || 3000),
          "path"    : "/",
          "method"  : "GET"
          };
    console.log('[INF]', 'Request options: ' + util.inspect(options));
    var request = http.request(options, function(response) {
      response.on('data', function(chunk) {
        console.log("GET got ", chunk.length, " characters.");
        test.ok(chunk.length > 0, "get response is 0");
        test.done();
      });
    });
    
    request.on('error', function(e) {
        console.log('problem with request: ' + e.message);
    });
    request.end();

  }
};
