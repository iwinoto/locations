#!/bin/bash

#############
# Colors	#
#############
green='\e[0;32m'
red='\e[0;31m'
label_color='\e[0;33m'
no_color='\e[0m' # No Color

#############
# Variables	#
#############

# Used to create a public route within the space for accessing the deployed 
# application. The reserved CF_SPACE variable (configured in the deployer) is 
# used to unique the route name per space.
if [ "${CF_SPACE}" == "prod" ]; then
	PUBLIC_HOST=${CF_APP}
else
	PUBLIC_HOST="${CF_SPACE}-${CF_APP}"
fi

# Extract the selected build number from the reserved BUILD_SELECTOR variable.
SELECTED_BUILD=$(grep -Eo '[0-9]{1,100}' <<< "${BUILD_SELECTOR}")

# Compute a unique app name using the reserved CF_APP name (configured in the 
# deployer or from the manifest.yml file), the build number, and a 
# timestamp (allowing multiple deploys for the same build).
NEW_APP_NAME="${CF_APP}-$SELECTED_BUILD-$(date +%s)"

# Domain can be customized if needed.
DOMAIN=mybluemix.net 
# Used to define a temporary route to test the newly deployed app
TEST_HOST=$NEW_APP_NAME
# Java artifact being deployed. Needs to match output from 
# the build process.
WAR=Pipeline_hello1.war
MEMORY=256M

echo `cat /etc/*-release`
echo `cf --version`

CF_TRACE=true

echo -e "${label_color}Variables:${no_color}"
echo "PUBLIC_HOST=$PUBLIC_HOST"
echo "DOMAIN=$DOMAIN"
echo "NEW_APP_NAME=$NEW_APP_NAME"
echo "TEST_HOST=$TEST_HOST"
echo "WAR=$WAR"
echo "MEMORY"=$MEMORY

#############
# Steps 	#
#############

#############
# (1) Find existing deployed apps (usually one) to the space
# based on the binding to the PUBLIC_HOST
#############
rm -f apps.txt
echo -e "${label_color}Find all existing deployments:${no_color}"
cf apps | { grep $PUBLIC_HOST || true; } | sed -r "s/\x1B\[([0-9]{1,2}(;[0-9]{1,2})?)?[mGK]//g" &> apps.txt

cat apps.txt

# Store just the deployed application names
awk '{ print $1 }' apps.txt > app_names.txt

rm -f apps.txt

#############
# (2) Push the updates from the build to create a newly deployed
# application.
#############
echo -e "${label_color}Pushing new deployment - ${green}$NEW_APP_NAME${no_color}"
cf push $NEW_APP_NAME -p $WAR -d $DOMAIN -n $TEST_HOST -m $MEMORY
DEPLOY_RESULT=$?
if [ $DEPLOY_RESULT -ne 0 ]; then
	echo -e "${red}Deployment of $NEW_APP_NAME failed!!"
	cf logs $NEW_APP_NAME --recent
	return $DEPLOY_RESULT
fi

echo -e "${label_color}APPS:${no_color}"
cf apps | grep ${CF_APP}

#############
# (3) Inject testing to ensure that the new app version is good.
#############
echo -e "${label_color}Testing new app - ${green}$NEW_APP_NAME${no_color}"
curl "http://$TEST_HOST.$DOMAIN"
TEST_RESULT=$?
if [ $TEST_RESULT -ne 0 ]; then
	echo -e "${red}New app did not deploy properly - ${green}$NEW_APP_NAME${no_color}"
	return $TEST_RESULT
else
	echo -e "${green}Test PASSED!!!!${no_color}"	
fi

#############
# (4) Map traffic to the new version by binding to the
# public host.
# NOTE: The old version(s) is still taking traffic to avoid 
# disruption in service.
#############
echo -e "${label_color}Map public space route to new app - ${green}$NEW_APP_NAME${no_color}"
cf map-route $NEW_APP_NAME $DOMAIN -n $PUBLIC_HOST

echo -e "${label_color}Public route bindings:${no_color}"
cf routes | { grep $PUBLIC_HOST || true; }

#############
# (5) Delete the temporary route that was used for testing
# since it is no longer needed.
#############
echo -e "${label_color}Remove and delete test route - ${green}$TEST_HOST${no_color}"
cf unmap-route $NEW_APP_NAME $DOMAIN -n $TEST_HOST
if [ $? -ne 0 ]; then
	echo -e "${label_color}Test route isn't mapped and doesn't need to be removed.${no_color}"
fi
cf delete-route $DOMAIN -n $TEST_HOST -f

#############
# (6) Delete the old application(s) at this point.
# They are no longer needed.
#############
while read name
do
	if [ "$name" != "$NEW_APP_NAME" ]; then
    	echo -e "${label_color}Deleting old deployed application - $name${no_color}"
		cf delete $name -f
	fi
done < app_names.txt

rm -f app_names.txt

#############
# Summary 	#
#############
echo -e "${label_color}Deployed Applications:${no_color}"
cf apps | grep ${CF_APP}
echo -e "${label_color}Public route bindings:${no_color}"
cf routes | grep $PUBLIC_HOST

echo -e "${label_color}You have successfully executed a rolling deployment of ${green}$NEW_APP_NAME${no_color}."
echo -e "${green}SIMPLY AWESOME!!!!${no_color}"