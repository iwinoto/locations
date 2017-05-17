/*global module:false*/

module.exports = function(grunt) {
  // Project configuration.
  grunt.initConfig({
    // Metadata.
    // distributables location
    dist: 'target',
    // Application package:
    pkg: grunt.file.readJSON(grunt.template.process('package.json')),
    // Cloud Foundry target
    cf_env: (grunt.file.readJSON('cf-targets.json'))[(grunt.option('cf-target') || 'public-dev')],
    // hostname
    hostname: '<%= cf_env.prefix %>-<%= pkg.name %>-<%= cf_env.space %>',
    // Source header
    banner: '/*! <%= pkg.title || pkg.name %> - v<%= pkg.version %> - ' +
      '<%= grunt.template.today("yyyy-mm-dd") %>\n' +
      '<%= pkg.homepage ? "* " + pkg.homepage + "\\n" : "" %>' +
      '* Copyright (c) <%= grunt.template.today("yyyy") %> <%= pkg.author.name %>;' +
      ' Licensed <%= _.pluck(pkg.licenses, "type").join(", ") %> */\n',
    // Task configuration.
    env : {
      options : {
      //Shared Options Hash
      },
      unit_test : {
        LOCATIONS_UNIT_TESTING : 'true',
        TEST_ROUTE : '',
        TEST_PORT : '3000'
      },
      dev : {
        LOCATIONS_UNIT_TESTING : 'false',
        TEST_REMOTE : 'true',
        TEST_ROUTE : '<%= hostname %>.mybluemix.net',
        TEST_PORT : '80'
      }
    },
    
    concat: {
      options: {
        banner: '<%= banner %>',
        stripBanners: true
      },
      dist: {
        //src: ['lib/<%= pkg.name %>.js'],
        //dest: 'dist/<%= pkg.name %>.js'
        files: [{
            expand: true,     // Enable dynamic expansion.
            cwd: 'lib/',      // Src matches are relative to this path.
            src: ['**/*.js'], // Actual pattern(s) to match.
            dest: 'build/lib',    // Destination path prefix.
            ext: '.js',       // Dest filepaths will have this extension.
            extDot: 'first'   // Extensions in filenames begin after the first dot
        },],
      }
    },
    
    uglify: {
      options: {
        banner: '<%= banner %>'
      },
      dist: {
        //src: '<%= concat.dist.dest %>',
        //dest: 'dist/<%= pkg.name %>.min.js'
        files: [{
            expand: true,     // Enable dynamic expansion.
            cwd: 'build/',    // Src matches are relative to this path.
            src: ['**/*.js'], // Actual pattern(s) to match.
            dest: '<%= dist %>/',   // Destination path prefix.
            ext: '.js',       // Dest filepaths will have this extension.
            extDot: 'first'   // Extensions in filenames begin after the first dot
        },],
      }
    },
    
    jshint: {
      options: {
        curly: true,
        eqeqeq: true,
        immed: true,
        latedef: true,
        newcap: true,
        noarg: true,
        sub: true,
        undef: true,
        unused: true,
        boss: true,
        eqnull: true,
        browser: true,
        trailing: true,
        node: true,
        asi: true,
        globals: {}
      },
      gruntfile: {
        src: 'Gruntfile.js'
      },
      lib_test: {
        src: ['test/**/*.js', '<%= dist %>/test/**/*.js']
      }
    },
    
    qunit: {
      files: ['test/**/*.html']
    },
    
    watch: {
      gruntfile: {
        files: '<%= jshint.gruntfile.src %>',
        tasks: ['jshint:gruntfile']
      },
      lib_test: {
        files: '<%= jshint.lib_test.src %>',
        tasks: ['jshint:lib_test', 'qunit']
      }
    },
    
    copy: {
      main: {
        files: [
          // copy build files
          {src: ['Gruntfile.js'], dest: '<%= dist %>/'},
          {src: ['cf-services.json'], dest: '<%= dist %>/'},
          {src: ['cf-targets.json'], dest: '<%= dist %>/'},
          // includes files within path and its sub-directories
          {src: ['package.json'], dest: '<%= dist %>/'},
          {src: ['manifest-base.yml'], dest: '<%= dist %>//manifest.yml'},
          {expand: true, src: ['*.cer'], dest: '<%= dist %>/'},
          {src: ['.cfignore'], dest: '<%= dist %>/'},
          {expand: true, src: ['test/**/*.*'], dest: '<%= dist %>/'},
          // copy UI files
          {expand: true, src: ['views/**/*.*'], dest: '<%= dist %>/'}
        ]
      },
      debug: {
        files: [
          // copy build/ files - pre uglify
          {expand: true, cwd: 'build/', src: ['**'], dest: '<%= dist %>/'}
        ]
      }
    },
    
    nodeunit: {
      all: ['test/**/*.js'],
      options: {
        reporter: 'junit',
        reporterOptions: {
          output: '<%= dist %>/failsafe-reports'
        }
      }
    },
    
    clean: ['build/', '<%= dist %>'],
    
    shell: {
      login: {
        command:  function() {
          var target = grunt.config('cf_env.target');
          var org = grunt.config('cf_env.organisation');
          var space = grunt.config('cf_env.space');
          var cmd = ['cf api ' + target,
                'cf auth ' + process.env.CF_USER + ' ' + process.env.CF_PASSWD,
                'cf target -o ' + org + ' -s ' + space];
          grunt.log.writeln('Login to Bluemix with\n' +
              '\t target: ' + target + '\n' +
              '\t organisation: ' + org + '\n' +
              '\t space: ' + space + '\n' +
              '\t user: ' + process.env.CF_USER + '\n');
          return cmd.join('&&');
        }
      },
      push: {
        command: function() {
          // Application hostname
          var hostname = grunt.config.get('hostname');
          var dist_dir = grunt.config('dist');
          var app_name = grunt.config('pkg.name');
          var cmd = ['cd ' + dist_dir,
                'cf push ' + app_name + ' -n ' + hostname];
          grunt.log.writeln('Push to Bluemix with\n' +
              '\t app: ' + app_name + '\n' +
              '\t hostname: ' + hostname + '\n' +
              '\t with command: ' + cmd);
          return cmd.join('&&');
        }
      },
      create_services: {
        command: function() {
          var services = grunt.file.readJSON('cf-services.json');
          //var dist_dir = grunt.config('dist');
          //var cmd = ['cd ' + dist_dir + '/'];
          var cmd = [];
          Object.keys(services).forEach(function(key) {
            var service = services[key];
            cmd.push('cf create-service ' + service.type + ' ' + service.plan + ' ' + key);
            grunt.log.writeln('Creating service\n' +
              '\t name: ' + key + '\n' +
              '\t type: ' + services[key].type + '\n' +
              '\t plan: ' + services[key].plan + '\n' +
              '\t commands: ' + cmd);
          });
          return cmd.join('&&');
        }
      }
    }
  });

  //Set route in grunt.env.dev.TEST_ROUTE
  var hostname = grunt.config.get('hostname');
  var route = hostname + '.mybluemix.net';
  grunt.log.writeln('hostname = ' + hostname);
  grunt.log.writeln('default route = ' + route);
  grunt.log.writeln('env.dev.TEST_ROUTE = ', grunt.config('env.dev.TEST_ROUTE'));
  var manifest = grunt.file.readYAML('manifest-base.yml');
  var pkg = grunt.config.get('pkg');
  grunt.log.writeln('Getting route for ' + hostname);
  manifest.applications.forEach(function(app){
    if(app.name === pkg.name){
      grunt.log.writeln('Found app ' + app.name + ' in manifest.');
      route = hostname + '.' + app.domain;
      grunt.log.writeln('Setting route to ' + route);
    }
  });
  grunt.log.writeln('Route is ' + route);
  grunt.config('env.dev.TEST_ROUTE', route);

  // These plugins provide necessary tasks.
  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-contrib-qunit');
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-copy');
  grunt.loadNpmTasks('grunt-contrib-nodeunit');
  grunt.loadNpmTasks('grunt-env');
  grunt.loadNpmTasks('grunt-shell');
  
  grunt.registerTask('deploy',
      'Deploy the application to a CF target.\n' +
      'Set up targets in cf-targets.json and services in cf-services.json.\n' +
      'Pass in a target key using the --cf-target=<target key> option. Defaults to "public-dev".\n' +
      'Set CF userID and password in environment variables CF_USER and CF_PASSWD.',
      ['env:dev', 'shell:login', 'shell:create_services', 'shell:push', 'nodeunit']);
  grunt.registerTask('create_services',
      'Deploy the application to a CF target from IBM DevOps Services (IDS).\n' +
      'Target information, including credentials, is configured in IDS pipeline configuration UI.\n' +
      'All we do is create services from information in cf-services.json.\n',
      ['env:dev', 'shell:login', 'shell:create_services']);
  grunt.registerTask('full', ['clean','jshint', 'env:unit_test', 'nodeunit', 'qunit', 'concat', 'uglify', 'copy:main']);
  grunt.registerTask('default', ['clean', 'jshint', 'env:unit_test', 'nodeunit', 'concat', 'uglify', 'copy:main']);
  grunt.registerTask('debug', ['clean', 'jshint', 'nodeunit', 'concat', 'copy:debug']);
  grunt.registerTask('test', ['jshint', 'nodeunit']);
  grunt.registerTask('notest', ['clean', 'jshint', 'concat', 'uglify', 'copy:main']);
};
