Author: Iwan Winoto, iwinoto@au1.ibm.com

Hacked after an example from http://www.slideshare.net/christkv/node-js-mongodriver

# To run locally
* Install node.js
* Install mongodb
* Install required modules

	$ npm install

* Start the app

	$ npm start

* Hit the URL http://localhost:3000/

# Environment variables

*LOCATIONS_LOGIN_REQUIRED=true*

  Turns on authentication using FIM on w3 by default, unless the idaas
  service is configured in the manifest used to deploy to BlueMix/CF.
    
*LOCATIONS_UNIT_TESTING=true*

  Deploy target will run unit tests. If you don't have mongodb, then
  you can stub it out by setting this

# To build and deploy
 * Install grunt and cf.
 * Configure the target environments in `cf-targets.json`
 * Configure the services in `cf-service.json`
 * Edit the manifest files as desired. In most cases you should only need to
change the application name prefix in the `manifest-base.yml` as this will
set up the host url.

## Build
To build and run unit tests, run the default grunt task.

	$ grunt

The distributable code will be in `target/`

## Deploy
To deploy to a CF target, set environment variables with the credentials
for your target CF server.

	$ export CF_USER=<your cf user ID>
	$ export CF_PASSWD=<your cf password>

The grunt deploy task will push to a target specified in `cf-target.json`.
You can specify a key into the `cf-targets.json` with the `cf-target` option.
Other wise it will default to `public-dev`.

	$ grunt deploy --cf-target=public-dev

This will log in to the CF target, set the target organisation and space,
create the services specified in `cf-service.json` and push the application.
