/*globals define, WebGMEGlobal*/
/*jshint browser: true*/

/**
 * Generated by VisualizerGenerator 0.1.0 from webgme on Wed Apr 06 2016 14:15:27 GMT-0500 (CDT).
 */

define([
    'text!./Plot.html',
    'blob/BlobClient',
    './ResultsVizWidget.Parser',
    './ResultsVizWidget.Plotter',
    'q',
    'css!./styles/ResultsVizWidget.css'
], function (
    PlotHtml,
    BlobClient,
    Parser,
    Plotter,
    Q) {
    'use strict';

    var ResultsVizWidget,
    WIDGET_CLASS = 'results-viz';

    ResultsVizWidget = function (options) {
        this._logger = options.logger.fork('Widget');

        this._el = options.container;

	this._blobClient = new BlobClient({logger: options.logger.fork('BlobClient')});
	this._client = options.client;

        this.nodes = {};
        this._initialize();

        this._logger.debug('ctor finished');
    };

    ResultsVizWidget.prototype._initialize = function () {
        var width = this._el.width(),
        height = this._el.height(),
        self = this;

        // set widget class
        this._el.addClass(WIDGET_CLASS);
    };

    ResultsVizWidget.prototype.onWidgetContainerResize = function (width, height) {
        //console.log('Widget is resizing...');
    };

    // Adding/Removing/Updating items
    ResultsVizWidget.prototype.addNode = function (desc) {
        if (desc) {
	    var datas = {};
	    var first_time = undefined;
	    var last_time = undefined;
	    desc.logs = {};

	    var hidePlotFunc = function(a) {
		var active = datas[a].active ? false : true;
		var opacity = active ? 0 : 1;
		var visibility = active ? 'hidden' : 'visible';
		var display = active ? 'none' : 'block';
		d3.select('#plot_'+a)
		    .transition().duration(100)
		    .style('opacity', opacity)
		    //.style('visibility', visibility);
		    .style('display', display);
		datas[a].active = active;
	    };

	    var tasks = desc.attributes.map((key) => {
		var deferred = Q.defer();
		var a = key;
		// load the attribute
		var nodeObj = this._client.getNode(desc.id);
		var logHash = nodeObj.getAttribute(a);
		if (logHash) {
		    this._blobClient.getObjectAsString(logHash)
			.then((data) => {
			    desc.logs[a] = data;
			    // parse the logs
			    datas[a] = Parser.getDataFromAttribute(data);
			    var aliases = Object.keys(datas[a]);
			    aliases.map((key) => {
				var d = datas[a][key].data;
				var first_entry = d[0];
				var last_entry = d[d.length-1];
				if ( first_time === undefined || first_time > first_entry[0] ) {
				    first_time = first_entry[0];
				} 
				if ( last_time === undefined || last_time < last_entry[0] ) {
				    last_time = last_entry[0];
				}
			    });
			    deferred.resolve();
			});
		    return deferred.promise;
		}
	    });
	    if (desc.parser) {
		tasks.concat(desc.attributes.map((key) => {
		    var deferred = Q.defer();
		    var a = key;
		    // load the attribute
		    var nodeObj = this._client.getNode(desc.id);
		    var logHash = nodeObj.getAttribute(a);
		    
		    var userParseFunc = eval(desc.parser);
		    if (logHash) {
			this._blobClient.getObjectAsString(logHash)
			    .then((data) => {
				desc.logs[a] = data;
				// parse the logs
				datas[a] = userParseFunc(data);
				var aliases = Object.keys(datas[a]);
				aliases.map((key) => {
				    var d = datas[a][key].data;
				    var first_entry = d[0];
				    var last_entry = d[d.length-1];
				    if ( first_time === undefined || first_time > first_entry[0] ) {
					first_time = first_entry[0];
				    } 
				    if ( last_time === undefined || last_time < last_entry[0] ) {
					last_time = last_entry[0];
				    }
				});
				deferred.resolve();
			    });
			return deferred.promise;
		    }
		}));
	    }
	    return Q.all(tasks)
		.then(() => {
		    for (var a in desc.logs) {
			// setup the html
			this._el.append(PlotHtml);
			var container = this._el.find('#log');
			$(container).attr('id', 'log_'+a);
			
			var title = this._el.find('#title');
			$(title).attr('id','title_'+a)
			    .on('click', function(_a) {
				return function() {
				    hidePlotFunc(_a);
				};
			    }(a));

			title.append('<b>'+a+'</b>');

			var p = this._el.find('#plot');
			$(p).attr('id',"plot_" + a);

			var data = datas[a];
			var offset = first_time;
			if (!_.isEmpty(data)) {
			    var aliases = Object.keys(data);
			    aliases.map((key) => {
				data[key].data.push([last_time, 0]);
			    });
			    Plotter.plotData('#plot_'+a, data, offset);
			}
			else
			    $(container).detach();
		    }
		    this.nodes[desc.id] = desc;
		});
        }
    };

    ResultsVizWidget.prototype.removeNode = function (gmeId) {
        var desc = this.nodes[gmeId];
        this._el.append('<div>Removing node "'+desc.name+'"</div>');
        delete this.nodes[gmeId];
    };

    ResultsVizWidget.prototype.updateNode = function (desc) {
        if (desc) {
            //console.log('Updating node:', desc);
            this._el.append('<div>Updating node "'+desc.name+'"</div>');
        }
    };

    /* * * * * * * * Visualizer event handlers * * * * * * * */

    ResultsVizWidget.prototype.onNodeClick = function (id) {
        // This currently changes the active node to the given id and
        // this is overridden in the controller.
    };

    ResultsVizWidget.prototype.onBackgroundDblClick = function () {
    };

    /* * * * * * * * Visualizer life cycle callbacks * * * * * * * */
    ResultsVizWidget.prototype.destroy = function () {
    };

    ResultsVizWidget.prototype.onActivate = function () {
        //console.log('ResultsVizWidget has been activated');
    };

    ResultsVizWidget.prototype.onDeactivate = function () {
        //console.log('ResultsVizWidget has been deactivated');
    };

    return ResultsVizWidget;
});
