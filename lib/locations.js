/*global require process console escape*/

require("cf-autoconfig");

var express = require('express'),
	openid = require('openid'),
	math = require('mathjs')(),
	MongoClient = require('mongodb').MongoClient,
	Db = require('mongodb').Db,
	Server = require('mongodb').Server,
	db,
	Connection = require('mongodb').Connection,
	ObjectID,
	dbName = "node-mongo-examples",
	crypto = require('crypto'),
	fs = require('fs'),
	http = require('http'),
	util = require('util'),
  _ = require("underscore"),
	regex = require('xregexp').XRegExp,
	earthRadiusMetres = 6378100,
	isLoginRequired = (process.env.LOCATIONS_LOGIN_REQUIRED == 'true'),
	unitTesting = (process.env.LOCATIONS_UNIT_TESTING == 'true'),
	server;

//Only load loganalysis if MonitoringAndAnalytics add-on is bound

//isLoginRequired = true;

if (process.env.VCAP_SERVICES) {
  //VCAP_SERVICES is available - initialise bound services");
  
  var cfEnv = require("cf-env"),
    service;
  if (service = cfEnv.getService(regex("MonitoringAndAnalytics", 'i'))) {
    //Only require loganalysis when the MonitoringAndAnalytics add-on is bound otherwise
    //we'll get an error about missing client.crt file.
    require("loganalysis");
  };
  
  if (service = cfEnv.getService(regex("mongo.*", 'i'))) {
    var mongo = service.credentials;
  } else {
		console.log("No Mongo service crendentials found.\nExiting with 1.");
		process.exit(1);
	};
	
  if (service = cfEnv.getService(regex("w3sso.*", 'i'))) {
    var w3sso = service.credentials;
  } else {
		if(isLoginRequired){
			console.log("No W3 SSO service crendentials found.\nExiting with 1.");
			process.exit(1);
		};
	};
} else {
  //VCAP_SERVICES is not available, so we're probably not on Bluemix.
  //Create default credential objects
  var mongo = {
    host: "localhost",
    port: Connection.DEFAULT_PORT,
    url: "mongodb://localhost:" + Connection.DEFAULT_PORT + "/" + dbName
//    url: "mongodb://IbmCloud_jpk3v63n_ektftaba_pu41evhe:-hx-RhrNLBePsjNGO2QT1XWjnaE9Rt9-@ds033509.mongolab.com:33509/IbmCloud_jpk3v63n_ektftaba"
  };
  
  var w3sso = {
  	openidProviderURL2: "https://tfim01.demos.ibm.com/FIM/op",
  	openidProviderURL: "https://w3.innovate.ibm.com/FIM/blueid",
  	adminURL: "https://w3.innovate.ibm.com/blueidadmin",
  	GeoTrustGlobalCA: fs.readFileSync("g1.cer").toString(),
  	GeoTrustSSLCA: fs.readFileSync("g2.cer").toString()
  };  
};

//http://stackoverflow.com/questions/14619576/where-is-the-default-ca-certs-used-in-nodejs
if(isLoginRequired){
	require('https').globalAgent.options.ca = [
			w3sso.GeoTrustGlobalCA,
			w3sso.GeoTrustSSLCA];
}

if(unitTesting){
  //Create stub database
  console.log("[INF unit]", "setup DB stubs for unit testing");
  console.log("Env process.env.LOCATIONS_UNIT_TESTING: " + process.env.LOCATIONS_UNIT_TESTING);
  console.log("Setting up unit test stubs");
  
  //db = new Db('node-mongo-examples', new Server(mongo.host, mongo.port, {}), {native_parser:false, fsync:true});
  db = Db;
  
  var Cursor = require('mongodb').Cursor;
  console.log("db: " + db);
  var testData = [{
        _id: 1,
        session: "test@test.com",
        description: "IBM Centre",
        address: "601 Pacific Highway, Sydney NSW 2065, Australia",
        loc:{lat: -33.8233087, long: 151.1967238}
            }];

  var cursorStub = new Cursor(db, "locations", {}, {});
  cursorStub.toArray = function(func){
    if(func){
      return func({}, testData);
    }else{
      return testData;
    };
  };
  
  var collStub = {
    find: function (obj, func) {
      if(func){
        return func({}, cursorStub);
      }else{
        return cursorStub;
      };
    },
    findOne: function(obj, func){
      if(func){
        return func({}, cursorStub);
      }else{
        return cursorStub;
      };
    }
  };
  db.open = function(func){};
  db.close = function(){};
  db.ensureIndex = function(coll, obj, func){
    return func({}, collStub);
  };
  db.collection = function(coll, func){
    if(func){
      return func({}, collStub);
    }else{
      return collStub;
    };    
  };
  db.command = function(commandSpec, func){
    return func({}, testData);
  };
}else{
  //DB url may be uri (MongoLab) or url (mongodb) in the credentials
  url = mongo.url||mongo.uri;

  //Initialize connection and open
  MongoClient.connect(url + "?native_parser=false&fsync=true", function(err, database) {
    if(err) throw err;

    db = database;
    
    // ensure the 'locations' collection supports 2d geospatial index
    // ref: http://docs.mongodb.org/manual/applications/geospatial-indexes/
    db.ensureIndex("locations", {loc:"2d"}, function(err, result) {
      if(err){ throw err; }
    });
    /**
    TODO: Convert data to jsonGeo point data and indexing to 2dsphere.
    Can then search in metres, instead of having to convert from radian to metres
    and estimate spherical distances over a 2d plane model.
    This would require a script to run over the data to convert point coordinates
    to jsonGeo point documents.
    **/
    /*
    db.ensureIndex("locations", {jsongeo:"2dsphere"}, function(err, result) {
      if(err){ throw err; }
    });
    */
    ObjectID = db.bson_serializer.ObjectID;
  });
};

var app = express();

app.configure(function(){
	app.set('port', process.env.VCAP_APP_PORT || '3000');
	app.set('host', process.env.VCAP_APP_HOST || 'localhost');
	app.use(express.bodyParser());
	app.use(express.methodOverride());
	app.set('view engine', 'jade');
	app.set('view options', {layout: false});
	// Required by session() middleware
	// pass the secret for signed cookies
	app.use(express.cookieParser('keyboard cat'));
	// Populates req.session
	app.use(express.session());
});

// Formatting of lat/long in jade use sprintf
// ref: http://stackoverflow.com/questions/13946957/jade-printf-like-number-formatting
app.locals.sprintf = require('sprintf').sprintf;
app.locals.format = "%+2.4f";

var extensions = [];

var ax = new openid.AttributeExchange({
    "http://axschema.org/contact/email": "required",
    "http://axschema.org/namePerson/first": "required",
    "http://axschema.org/namePerson/last": "required",
    "http://www.ibm.com/axschema/bluepages/dn": "required"
    });
extensions.push(ax);
var verificationURL = (process.env.VCAP_APPLICATION ? 'http://' + JSON.parse(process.env.VCAP_APPLICATION).uris[0] : 'http://' + app.get('host') + ':' + app.get('port'))+ '/login/verify';

var relyingParty = new openid.RelyingParty(
	verificationURL,                    // Verification URL (yours)
	null,								// Realm (optional, specifies realm for OpenID authentication)
	false,								// Use stateless verification
	false,								// Strict mode
	extensions
);

//Request Google maps service for gelocation from address.
//lat/long is populated to object.
//At completion event, callback is called.
var geoCodeDecorateObject = function(address, object, callback) {
	var googleGeoCodeApi = {
		host: 'maps.googleapis.com',
		port: 80,
		path: '/maps/api/geocode/json?sensor=false&address=' + escape(address),
		method: 'GET'
	};

	var clientReq = http.get(googleGeoCodeApi, function(clientRes) {
		var data = [];
    
		clientRes.on('data', function(chunk) {
			data.push(chunk.toString());
		});
    
		clientRes.on('end', function() {
			var googleObject = JSON.parse(data.join(''));

			object.address = address;
			object.geodata = googleObject.results.pop();
      
			//  !!! CHANGE
			object.loc =  {long:object.geodata.geometry.location.lng, lat:object.geodata.geometry.location.lat};
			object.jsongeo = { type: "Point", coordinates: [object.loc.long, object.loc.lat] };
			callback(null, object);        
		});
	});
  
	clientReq.end();  
};


app.get('/', function(req, res) {
	db.collection('locations', function(err, collection) {
		// Is the user session established then show locations
		if(!isLoginRequired){
			// User login is not required, so set the session owner to public
			req.session.email = "public";
		};
		if (req.session.email) {
			collection.find({session:req.session.email}).toArray(function(err, items) {
				res.render('./locations.jade', {locations:items, user: req.session.email, host:app.get('host'), port:app.get('port')});
			});
		} else {
			// If no session, send user to w3 SSO to login and get a session
			// Store session id in session
			res.render('./login.jade');
		};
	});
});

app.get('/login/authenticate', function(req, res) {
	var identifier = w3sso.openidProviderURL;

	// Resolve identifier, associate, and build authentication URL
	relyingParty.authenticate(identifier, false, function(error, authUrl) {
		if (error) {
			res.writeHead(200);
			res.end('Authentication failed: ' + error.message);
		} else if (!authUrl) {
			res.writeHead(200);
			res.end('Authentication failed');
		} else {
			res.writeHead(302, { Location: authUrl });
			res.end();
		};
	});	
});

app.get('/login/verify', function(req, res) {
    relyingParty.verifyAssertion(req, function(error, result) {
        console.log(util.inspect(result));
        req.session.email = result.email;
		res.writeHead(302, {Location: '/'});
		res.end();
	});
});

// Search option
app.post('/search', function(req, res) {
	//get geolocation of query address
	geoCodeDecorateObject(req.body.address, {}, function(err, object) {
		// Unpack geo object
		var long = object.geodata.geometry.location.lng;
		var lat = object.geodata.geometry.location.lat;
		/**
		TODO: Convert data to jsonGeo point data and indexing to 2dsphere.
		Can then search in metres, instead of having to convert from radian to metres
		and estimate spherical distances over a 2d plane model.
		**/
		var geoNear = {geoNear: 'locations',
					near: [long, lat],
					maxDistance: math.divide(parseFloat(req.body.distance), earthRadiusMetres),		//max radius in metres
					query: {session: req.session.email},
					spherical: true };
		db.command(geoNear, function(err, geoItems) {
			// Fetch all docs for rendering of list
			(db.collection('locations')).find({session: req.session.email}).toArray(function(err, items) {
				res.render('./locations.jade', {locations:items, user: req.session.email, results:geoItems.results, searchaddress: req.body.address, searchloc: {long: long, lat: lat}, searchdistance: req.body.distance, host:app.get('host'), port:app.get('port')});
			});
		});
	});
});

// Create method - add a new location
app.post('/location', function(req, res) {
	//get the gelocation
	geoCodeDecorateObject(req.body.address, {description:req.body.description}, function(err, object) {
		db.collection('locations', function(err, collection) {
			//add userID
			_.extend(object, {session : req.session.email});
			// Insert doc
			collection.insert(object, {safe:true}, function(err, result) {

				// Fetch all docs for rendering of list
				collection.find({session: req.session.email}).toArray(function(err, items) {            
					res.render('./locations.jade', {locations:items, user: req.session.email, host:app.get('host'), port:app.get('port')});
				});
			});
		});
	});
});

// Update method - update an existing location
app.put('/location', function(req, res) {
	var id = ObjectID.createFromHexString(req.body.id);
	db.collection('locations', function(err, collection) {

		collection.findOne({_id:id}, function(err, object) {
			//update description and address 
			object.description = req.body.description;
			object.address = req.body.address;
			// get geolocation from address
			geoCodeDecorateObject(req.body.address, object, function(err, object) {
				//Commit to collection
				collection.update({_id:object._id}, object, {safe:true}, function(err, numberOfUpdatedObjects) {

					// Fetch all docs for rendering of list
					collection.find({session: req.session.email}).toArray(function(err, items) {            
						res.render('./locations.jade', {locations:items, user: req.session.email, host:app.get('host'), port:app.get('port')});
					});
				});
			});
		});
	});
});

// Delete method - delete a location
app.del('/location', function(req, res) {
	var id = ObjectID.createFromHexString(req.body.id);
	db.collection('locations', function(err, collection) {
		collection.remove({_id:id}, {safe:true}, function(err, numberOfDeletedRecords) {
			// Fetch all docs for rendering of list
			collection.find({session: req.session.email}).toArray(function(err, items) {
				res.render('./locations.jade', {locations:items, user: req.session.email, host:app.get('host'), port:app.get('port')});
			});
		});
	});
});

// Get method to get a location to edit.
app.get('/location', function(req, res) {
	var id = ObjectID.createFromHexString(req.body.id);
	db.collection('locations', function(err, collection) {
		collection.findOne({_id:id}, function(err, item) {
			// Fetch all docs for rendering of list
			collection.find({session: req.session.email}).toArray(function(err, items) {            
				res.render('./locations.jade', {locations:items, user: req.session.email, location:item, host:app.get('host'), port:app.get('port')});
			});
		});
	});
});

app.get('/logout', function(req, res){
    if (req.session) {
        req.session.auth = null;
        res.clearCookie('auth');
        req.session.destroy(function() {});
    }
    res.redirect('/');
});

server = http.createServer(app);

exports.start = function(onListening){
	server.listen(app.get('port'), app.get('host'), function(err) {
		if (err) {
			console.log("Error in createServer:\n" + err);
			throw err;
		};
		console.log("Express server listening on host:port " + app.get('host') + ":" + app.get('port'));
		console.log("MongoDB server host:port " + mongo.host + ":" + mongo.port);
		console.log("MongoDB server url " + mongo.url);
		console.log("Env process.env.LOCATIONS_LOGIN_REQUIRED: " + process.env.LOCATIONS_LOGIN_REQUIRED);
		console.log("Login required: " + isLoginRequired);
		if (onListening != null) {
			onListening();
		};
	});
};

exports.stop = function(onClose){
	server.close(function() {
		console.log("locations server closed.");		//Closed for new connections
		db.close();
		if (onClose != null){
			onClose();
		};
	});
};

if(process.argv[2] == 'start'){
	exports.start();
};

