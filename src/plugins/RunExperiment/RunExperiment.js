/*globals define*/
/*jshint node:true, browser:true*/

/**
 * Generated by PluginGenerator 0.14.0 from webgme on Wed Mar 02 2016 22:17:40 GMT-0600 (Central Standard Time).
 */

define([
    'plugin/PluginConfig',
    'plugin/PluginBase',
    'text!./metadata.json',
    'rosmod/minify.json',
    'remote-utils/remote-utils',
    'webgme-to-json/webgme-to-json',
    'rosmod/processor',
    'q'
], function (
    PluginConfig,
    PluginBase,
    pluginMetadata,
    minify,
    utils,
    webgmeToJson,
    processor,
    Q) {
    'use strict';

    pluginMetadata = JSON.parse(pluginMetadata);

    /**
     * Initializes a new instance of RunExperiment.
     * @class
     * @augments {PluginBase}
     * @classdesc This class represents the plugin RunExperiment.
     * @constructor
     */
    var RunExperiment = function () {
        // Call base class' constructor.
        PluginBase.call(this);

	this.pluginMetadata = pluginMetadata;
    };

    RunExperiment.metadata = pluginMetadata;

    // Prototypal inheritance from PluginBase.
    RunExperiment.prototype = Object.create(PluginBase.prototype);
    RunExperiment.prototype.constructor = RunExperiment;

    RunExperiment.prototype.notify = function(level, msg) {
	var self = this;
	var prefix = self.projectId + '::' + self.projectName + '::' + level + '::';
	if (level=='error')
	    self.logger.error(msg);
	else if (level=='debug')
	    self.logger.debug(msg);
	else if (level=='info')
	    self.logger.info(msg);
	else if (level=='warning')
	    self.logger.warn(msg);
	self.createMessage(self.activeNode, msg, level);
	self.sendNotification(prefix+msg);
    };

    /**
     * Main function for the plugin to execute. This will perform the execution.
     * Notes:
     * - Always log with the provided logger.[error,warning,info,debug].
     * - Do NOT put any user interaction logic UI, etc. inside this method.
     * - callback always has to be called even if error happened.
     *
     * @param {function(string, plugin.PluginResult)} callback - the result callback
     */
    RunExperiment.prototype.main = function (callback) {
        // Use self to access core, project, result, logger etc from PluginBase.
        // These are all instantiated at this point.
        var self = this;

        // Default fails
        self.result.success = false;

	self.runningOnClient = false;

        if (typeof WebGMEGlobal !== 'undefined') {
	    self.runningOnClient = true;
        }

        self.updateMETA({});

	// What did the user select for our configuration?
	var currentConfig = self.getCurrentConfig();
	self.returnZip = currentConfig.returnZip;
	self.roscoreDelay = currentConfig.roscoreDelay;
	
	// will be filled out by the plugin
	self.experiment = [];
	self.rosCorePort = Math.floor((Math.random() * (65535-1024) + 1024));
	self.rosCoreIp = '';
	self.artifacts = {};

	webgmeToJson.notify = function(level, msg) {self.notify(level, msg);}
	utils.notify = function(level, msg) {self.notify(level, msg);}

	// the active node for this plugin is experiment -> experiments -> project
	var projectNode = self.core.getParent(self.core.getParent(self.activeNode));
	var projectName = self.core.getAttribute(projectNode, 'name');
	
	self.experimentName = self.core.getAttribute(self.activeNode, 'name');
	self.artifactName = self.experimentName + '+Configs';

	if (!self.runningOnClient) {
	    var path = require('path');
	    self.root_dir = path.join(process.cwd(), 
				      'generated', 
				      self.project.projectId, 
				      self.branchName,
				      projectName);
	    self.config_dir = path.join(self.root_dir,
					'experiments', 
					self.experimentName,
					'config-'+(new Date()).toUTCString());
	}

	webgmeToJson.loadModel(self.core, self.rootNode, projectNode, true)
	    .then(function(projectModel) {
		processor.processModel(projectModel);
		self.projectModel = projectModel.root;
                self.objectDict = projectModel.objects;
		// check to make sure we have the right experiment
		var expPath = self.core.getPath(self.activeNode);
		self.selectedExperiment = self.objectDict[expPath];
		if (!self.selectedExperiment) {
		    throw new String("Cannot find experiment!");
		}
		return self.mapContainersToHosts();
	    })
	    .then(function() {
		// check for binaries
		self.notify('info','checking for binaries');
		return self.checkBinaries();
	    })
	    .then(function() {
		// generate config files here
		self.notify('info','generating artifacts');
		return self.generateArtifacts();
	    })
	    .then(function() {
		// send the deployment + binaries off to hosts for execution
		self.notify('info','deploying onto system');
		return self.deployExperiment();
	    })
	    .then(function() {
		// create experiment nodes in the model corresponding
		// to created experiment mapping
		return self.createModelArtifacts();
	    })
	    .then(function() {
		if (self.runningOnClient)
		    return self.returnConfigs();
		else
		    return self.createZip();
	    })
	    .then(function() {
		return self.removeTempFiles();
	    })
	    .then(function() {
		// This will save the changes. If you don't want to save;
		self.notify('info','saving updates to model');
		return self.save('RunExperiment updated model.');
	    })
	    .then(function (err) {
		if (err.status != 'SYNCED') {
		    throw new String('Couldnt write to model!');
		}
		self.result.setSuccess(true);
		callback(null, self.result);
	    })
	    .catch(function(err) {
		self.removeTempFiles();
		if (self.experiment.length) { // if we made a host to container map
		    return self.stopHosts()
			.then(function() {
        		    self.notify('error', err);
			    self.result.setSuccess(false);
			    callback(err, self.result);
			});
		}
		else {
        	    self.notify('error', err);
		    self.result.setSuccess(false);
		    callback(err, self.result);
		}
	    })
		.done();
    };

    RunExperiment.prototype.mapContainersToHosts = function () {
	var self = this;

	self.notify('info','Experiment mapping containers in ' + 
		    self.selectedExperiment.Deployment.name +
		    ' to hosts in '  + self.selectedExperiment.System.name);

	var containers = self.selectedExperiment.Deployment.Container_list;
	var host_list = self.selectedExperiment.System.Host_list;
	if (!containers || !host_list) {
	    throw new String('System must have hosts and Deployment must have containers!');
	}
	var tasks = [];
	if (!self.runningOnClient)
	    tasks = utils.getAvailableHosts(host_list);
	else {
	    tasks = host_list.map(function(host) {
		var intf = host.Interface_list[0];
		var user = host.Users[0];
		return {host: host, intf: intf, user: user};
	    });
	}
	
	return Q.all(tasks)
	    .then(function(hosts) {
		self.notify('info', containers.length + ' mapping to ' + hosts.length);
		if (hosts.length < containers.length) {
		    throw new String('Cannot map ' + containers.length +
				     ' containers to ' + hosts.length +
				     ' available hosts.');
		}
		var sortedContainers = [];
		/*
		// TEMPORARY: ADD CONSTRAINTS JSON TO RESULT FOR SUBHAV
		self.blobClient.putFile(
		    'constraints.json',
		    JSON.stringify({containers: containers, hosts: hosts},null,2)
		)
		    .then(function (hash) {
			self.result.addArtifact(hash);
		    });
		*/
		// figure out which containers have which constraints;
		containers.map(function(container) {
		    container.constraints = [];
		    if (container.Node_list) {
			container.Node_list.map(function(node) {
			    if (node.Component_list) {
				node.Component_list.map(function(comp) {
				    if (comp.Constraint_list) {
					comp.Constraint_list.map(function(constraint) {
					    if (container.constraints.indexOf(constraint) == -1) {
						container.constraints.push(constraint);
					    }
					});
				    }
				});
			    }
			    else { // no components in the node
				throw new String('Node ' + node.name + ' contains no component instances to execute!');
			    }
			});
		    }
		    else { // no nodes in the container
			throw new String('Container ' + container.name + ' contains no runnable Nodes!');
		    }
		    sortedContainers.push(container);
		});
		// Sort containers by decreasing number of constraints
		// sort function :  < 0 -> a < b ; = 0 -> a==b ; > 0 -> b < a
		sortedContainers.sort(function(a,b) { 
		    return b.constraints.length - a.constraints.length
		});
		// Actually perform the mapping
		for (var c=0; c<sortedContainers.length; c++) {
		    var container = sortedContainers[c];
		    var constraints = container.constraints;
		    var foundHost = false;
		    for (var j=0; j<hosts.length; j++) {
			var host = hosts[j];
			var capabilities = host.host.Capability_list;
			if (self.capabilitiesMeetConstraints(capabilities, constraints)) {
			    self.experiment.push([container, host]);
			    hosts.splice(j,1);
			    foundHost = true;
			    break;
			}
		    }
		    if (!foundHost) {
			throw new String('Cannot map ' + container.name +
					 ' to any host; constraints: ' +
					 JSON.stringify(container.constraints,null,2) +
					 ' not met.');
		    }
		}
	    });
    };

    RunExperiment.prototype.capabilitiesMeetConstraints = function(capabilities, constraints) {
	var self = this;
	if (constraints.length == 0) {
	    return true;
	}
	if (constraints.length > 0 && capabilities == undefined) {
	    return false;
	}
	capabilities = capabilities.map((capability) => { return capability.name; });
	for (var c in constraints) {
	    var constraint = constraints[c];
	    if (capabilities.indexOf(constraint.name) == -1) {
		return false;
	    }
	}
	return true;
    };

    RunExperiment.prototype.checkBinaries = function() {
	var self = this;

	if (self.runningOnClient) {
	    self.notify('info', 'Skipping binary check in client mode.');
	    return;
	}
	
	var path = require('path');
	var fs = require('fs');
	var platforms = [];
	var binaries = [];
	self.experiment.map(function (containerToHostMap) {
	    // get the components required
	    var container = containerToHostMap[0];
	    container.Node_list.map(function(node) {
		var nodeConf = self.getNodeConfig(node);
		nodeConf['Component Instances'].map(function(ci) {
		    if (binaries.indexOf(ci.Definition) == -1) {
			binaries.push(ci.Definition);
		    }
		});
	    })
	    // get the platforms required
	    var host = containerToHostMap[1];
	    var devType = utils.getDeviceType(host.host);
	    if (platforms.indexOf(devType) == -1)
		platforms.push(devType);
	});
	var tasks = platforms.map(function (platform) {
	    var platformBinPath = path.join(self.root_dir,
					    'bin',
					    platform);
	    if (!fs.existsSync(platformBinPath)) {
		throw new String(platform + ' does not have compiled binaries!');
	    }
	    binaries.map(function(binary) {
		var libPath = platformBinPath + '/' + binary;
		if (!fs.existsSync(libPath)) {
		    var binName = path.basename(libPath);
		    throw new String(platform + ' missing compiled binary : ' + binName);
		}
	    });
	});
	return Q.all(tasks);
    };

    RunExperiment.prototype.getNodeConfig = function(node) {
	var self = this;
	var config = {};
	config.Name = node.name;
	config.Priority = node.Priority;
	config['Component Instances'] = [];
	config['Artifacts'] = [];
	if (node.Component_list) {
	    node.Component_list.map(function(comp) {
		// make the component instance configuration
		// NOTE: this currently supports both the old and new meta
		// TODO: update projects to conform to new meta.
		var ci = {
		    "Name": comp.name,
		    "Definition": "lib" + comp.base.name + ".so",
		    "SchedulingScheme": comp.SchedulingScheme,
		    "User Configuration": JSON.parse(JSON.minify(comp['User Configuration'])),
		    "Logging": {
			"Component Logger": {
			    "FileName": node.name + '.' + comp.name + '.user.log',
			    "Enabled": comp.Logging_UserEnable || comp.EnableLogging, 
			    "Unit": comp.Logging_UserUnit || comp.LoggingUnit,
			},
			"ROSMOD Logger": {
			    "FileName": node.name + '.' + comp.name + '.trace.log',
			    "Enabled": comp.Logging_TraceEnable || comp.EnableLogging,
			    "Unit": comp.Logging_TraceUnit || comp.LoggingUnit,
			}
		    },
		    "Timers": {},
		    "Publishers": [],
		    "Subscribers": {},
		    "Clients": [],
		    "Servers": {}
		};
		config['Artifacts'].concat(JSON.parse(JSON.minify(comp['User Artifacts'])));

		// warn about user logging settings
		if (ci.Logging['Component Logger'].Enabled) {
		    config['Artifacts'].push(ci.Logging['Component Logger']['FileName']);
		    if (ci.Logging['Component Logger'].Unit > 1) {
			self.notify(
			    'warning',
			    node.name + ' : ' +
				comp.name + ' : ' +
				' not all user logs may be captured.');
		    }
		}
		else {
		    self.notify(
			'warning',
			node.name + ' : ' +
			    comp.name + ' : ' +
			    ' will not produce user logs!');
		}

		// warn about trace logging settings
		if (ci.Logging['ROSMOD Logger'].Enabled) {
		    config['Artifacts'].push(ci.Logging['ROSMOD Logger']['FileName']);
		    if (ci.Logging['ROSMOD Logger'].Unit > 1) {
			self.notify(
			    'warning',
			    node.name + ' : ' +
				comp.name + ' : ' +
				' not all trace logs may be captured.');
		    }
		}
		else {
		    self.notify(
			'warning',
			    node.name + ' : ' +
				comp.name + ' : ' +
			    ' will not produce trace logs!');
		}

		if (comp.Timer_list) {
		    comp.Timer_list.map(function(timer) {
			var ti = {
			    "Name": timer.name,
			    "Period": timer.Period,
			    "Priority": timer.Priority,
			    "Deadline": timer.Deadline
			};
			ci.Timers[ti.Name] = ti;
		    });
		}
		if (comp.Subscriber_list) {
		    comp.Subscriber_list.map(function(sub) {
			var si = {
			    "Name": sub.name,
			    "Priority": sub.Priority,
			    "Deadline": sub.Deadline
			};
			ci.Subscribers[si.Name] = si;
		    });
		}
		if (comp.Server_list) {
		    comp.Server_list.map(function(server) {
			var si = {
			    "Name": server.name,
			    "Priority": server.Priority,
			    "Deadline": server.Deadline
			};
			ci.Servers[si.Name] = si;
		    });
		}
		config['Component Instances'].push(ci);
	    });
	}
	return config;
    };

    RunExperiment.prototype.generateArtifacts = function () {
	var self = this;
	var prefix = '';

	var projectName = self.projectModel.name;

	self.experiment.map(function (containerToHostMap) {
	    var container = containerToHostMap[0]; // container is [0], host is [1]
	    var host = containerToHostMap[1]; // container is [0], host is [1]
	    host.artifacts = [];
	    var nodes = container.Node_list;
	    if (nodes) {
		nodes.map(function(node) {
		    var nodeConfigName = prefix + node.name + '.config';
		    var config = self.getNodeConfig(node);
		    host.artifacts = host.artifacts.concat(config.Artifacts);
		    // want stopExperiment to copy the config back as well
                    host.artifacts.push(nodeConfigName);
		    self.artifacts[nodeConfigName] = JSON.stringify( config, null, 2 );
		});
	    }
	});

	if (self.runningOnClient) {
	    self.notify('info', 'Skipping config generation in client mode.');
	    return;
	}	

	var fnames = Object.keys(self.artifacts);
	var tasks = fnames.map(function(f) {
	    var path = require('path');
	    var filendir = require('filendir');
	    var deferred = Q.defer();
	    var fname = path.join(self.config_dir, f),
		data = self.artifacts[f];
	    filendir.writeFile(fname, data, function(err) {
		if (err) {
		    deferred.reject(err);
		}
		else {
		    deferred.resolve();
		}
	    });
	    return deferred.promise;
	});
	return Q.all(tasks)
	    .then(function() {
		self.notify('info', 'Generated artifacts.');
	    });
    };

    RunExperiment.prototype.copyArtifactsToHosts = function () {
	var self = this;

	var path = require('path');
	var tasks = self.experiment.map(function(link) {
	    var container = link[0];
	    var host = link[1];
	    var ip = host.intf.IP;
	    var user = host.user;
	    var devId = utils.getDeviceType(host.host);
	    var local_exe_dir = path.join(self.root_dir, 'bin', devId)
	    var deployment_dir = path.join(user.Directory,
					   'experiments',
					   self.experimentName);
	    return utils.mkdirRemote(deployment_dir, ip, user)
		.then(function() {
		    return utils.copyToHost(local_exe_dir,
					    deployment_dir,
					    ip,
					    user);
		})
		.then(function() {
		    return utils.copyToHost(self.config_dir,
					    deployment_dir,
					    ip,
					    user);
		});
	});
	return Q.all(tasks);
    };

    RunExperiment.prototype.stopHosts = function() {
	// used when we need to tear down a partially started experiment
	var self = this;
	self.notify('info', 'Encountered issue, tearing down experiment.');
	var path = require('path');
	var tasks = self.experiment.map(function(link) {
	    var host = link[1];
	    var ip = host.intf.IP;
	    var user = host.user;
	    var deployment_dir = path.join(user.Directory,
					   'experiments');
	    var host_commands = [
		'pkill rosmod_actor',
		'pkill roscore',
		'rc_kill',
		'rm -rf ' + utils.sanitizePath(deployment_dir)
	    ];
	    return utils.deployOnHost(host_commands, ip, user);
	});
	return Q.all(tasks);
    };

    RunExperiment.prototype.startRosCore = function() {
	var self = this;
	var path = require('path');
	var link = self.experiment[0];
	var container = link[0];
	var host = link[1];
	var ip = host.intf.IP;
	self.rosCoreIp = ip;
	host.runningRoscore = true;
	var user = host.user;
	var host_commands = [
	    'source '+host.host['ROS Install']+'/setup.bash',
	    'export ROS_IP='+ip,
	    'export ROS_MASTER_URI=http://'+ip+':'+self.rosCorePort,
	    'roscore --port=' + self.rosCorePort + ' &'
	];
	host_commands.push('sleep ' + self.roscoreDelay);
	self.notify('info','Starting ROSCORE at: ' + self.rosCoreIp+':'+self.rosCorePort);
	return utils.deployOnHost(host_commands, ip, user);
    };

    RunExperiment.prototype.startProcesses = function() {
	var self = this;
	var path = require('path');
	var tasks = self.experiment.map(function(link) {
	    var container = link[0];
	    var host = link[1];
	    var ip = host.intf.IP;
	    var user = host.user;
	    var deployment_dir = path.join(user.Directory,
					   'experiments',
					   self.experimentName);
	    var host_commands = [
		'cd ' + utils.sanitizePath(deployment_dir),
		'source '+host.host['ROS Install']+'/setup.bash',
		'export LD_LIBRARY_PATH=$PWD:$LD_LIBRARY_PATH',
		'export ROS_IP='+ip,
		'export ROS_MASTER_URI=http://'+self.rosCoreIp+':'+self.rosCorePort,
		'export DISPLAY=:0.0'
	    ];
	    if (container.Node_list) {
		container.Node_list.map(function(node) {
		    host_commands.push('DISPLAY=:0.0 rosmod_actor --config ' +
				       node.name + '.config &');
		});
	    }
	    //host_commands.push('sleep 10');
	    self.notify('info','starting binaries.');
	    return utils.deployOnHost(host_commands, ip, user);
	});
	return Q.all(tasks);
    };
    
    RunExperiment.prototype.cleanHost = function(host) {
	var self = this;
	var path = require('path');
	var base_dir = path.join(host.user.Directory, 'experiments');
	return utils.executeOnHost(['rm -rf ' + base_dir], host.intf.IP, host.user);
    };

    RunExperiment.prototype.deployExperiment = function () {
	var self = this;

	if (self.runningOnClient) {
	    self.notify('info', 'Not deploying experiment in client mode.');
	    return;
	}

	return self.copyArtifactsToHosts()
	    .then(function () {
		self.notify('info','Copied artifacts to hosts.');
		return self.startRosCore();
	    })
	    .then(function () {
		self.notify('info','Started roscore.');
		return self.startProcesses();
	    })
	    .then(function() {
		self.notify('info', 'Successfully started experiment.');
	    })
	    .catch(function (err) {
		var tasks = self.experiment.map(function(link) {
		    var host = link[1];
		    return self.cleanHost(host);
		});
		return Q.all(tasks)
		    .then(function() {
			throw err;
		    });
	    });
    };

    RunExperiment.prototype.createModelArtifacts = function () {
	var self=this;

	if (self.runningOnClient) {
	    // cant deploy experiment so no real map exists
	    return;
	}

	var metaNodes = self.core.getAllMetaNodes(self.activeNode);
	var fcoNode = self.core.getBaseRoot(self.activeNode);

	var containerX = 100;
	var hostX = 400;

	var rowY = 50;

	self.experiment.forEach(function(link) {
	    var container = link[0];
	    var host = link[1];
	    // use self.core.createNode(parameters);
	    //    parameters here has the following optional values:
	    //       * parent (node)
	    //       * base   (node) 
	    //       * relid  (string)
	    //       * guid   (GUID)

	    // should probably set the meta type here to be containers/hosts/(links?)
	    var cn = self.core.createNode(
		{parent: self.activeNode, base: self.META.Container}
	    );
	    var hn = self.core.createNode(
		{parent: self.activeNode, base: self.META.Host}
	    );
	    var ln = self.core.createNode(
		{parent: self.activeNode, base: fcoNode}
	    );

	    self.core.setRegistry(cn, 'position', {x: containerX, y:rowY});
	    self.core.setRegistry(hn, 'position', {x: hostX, y:rowY});

	    rowY += 200;

	    // use self.core.setAttribute(node, name, value);
	    //    value here can be any valid JS object (even nested types);
	    self.core.setAttribute(cn, 'name', container.name);
	    self.core.setAttribute(hn, 'name', host.host.name);
	    if (host.runningRoscore) {
		self.core.setAttributeMeta(hn, 'RunningRoscore', {type: 'boolean'});
		self.core.setAttribute(hn, 'RunningRoscore', host.runningRoscore);
	    }
	    self.core.setAttribute(hn, 'Host', host.host);
	    self.core.setAttribute(hn, 'Artifacts', host.artifacts);
	    self.core.setAttribute(hn, 'User', host.user);
	    self.core.setAttribute(hn, 'Interface', host.intf);
	    self.core.setAttribute(ln, 'name', 'MapsTo');
	    // optionally use self.core.setAttributeMeta(node, name, rule);
	    //    rule here defines the 'type' of the attribute
	    // use self.core.setPointer(node, name, target);
	    self.core.setPointer(ln, 'src', cn);
	    self.core.setPointer(ln, 'dst', hn);
	    // optionally use self.core.setPointerMetaTarget(node, name, targe, min(opt), max(opt));
	});
    };

    RunExperiment.prototype.returnConfigs = function() {
	var self = this;
	var artifact = self.blobClient.createArtifact(self.artifactName);
	var deferred = new Q.defer();
	artifact.addFiles(self.artifacts, function(err) {
	    if (err) {
		deferred.reject(err.message);
		return;
	    }
	    self.blobClient.saveAllArtifacts(function(err, hashes) {
		if (err) {
		    deferred.reject(err.message);
		    return;
		}
		self.result.addArtifact(hashes[0]);
		deferred.resolve();
	    });
	});
	return deferred.promise;
    };
    
    RunExperiment.prototype.createZip = function() {
	var self = this;
	
	if (!self.returnZip) {
            self.notify('info', 'Skipping compression.');
	    return;
	}
	
	return new Promise(function(resolve, reject) {
	    var zlib = require('zlib'),
		tar = require('tar'),
		fstream = require('fstream'),
		input = self.config_dir;

	    //self.logger.info('zipping ' + input);

	    var bufs = [];

	    var packer = tar.Pack()
		.on('error', function(e) { reject(e); });

	    var gzipper = zlib.Gzip()
		.on('error', function(e) { reject(e); })
		.on('data', function(d) { bufs.push(d); })
		.on('end', function() {
		    //self.logger.debug('gzip ended.');
		    var buf = Buffer.concat(bufs);
		    var name = self.projectName + '+' + self.experimentName + '+Config';
		    self.blobClient.putFile(name+'.tar.gz',buf)
			.then(function (hash) {
			    self.result.addArtifact(hash);
			    //self.logger.info('compression complete');
			    resolve();
			})
			.catch(function(err) {
			    reject(err);
			})
			    .done();
		});

	    var reader = fstream.Reader({ 'path': input, 'type': 'Directory' })
		.on('error', function(e) { reject(e); });

	    reader
		.pipe(packer)
		.pipe(gzipper);
	})
	    .then(function() {
		self.notify('info', 'Created archive.');
	    });
    };

    RunExperiment.prototype.removeTempFiles = function() {
	var self = this;

	if (self.runningOnClient)
	    return;

	var child_process = require('child_process');
	// clear out the temp files
	self.notify('info','Removing temporary files.');
	child_process.execSync('rm -rf ' + utils.sanitizePath(self.config_dir));
    };

    return RunExperiment;
});
