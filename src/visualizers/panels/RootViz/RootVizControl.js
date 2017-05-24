/*globals define, WebGMEGlobal*/
/*jshint browser: true*/
/**
 * Generated by VisualizerGenerator 0.1.0 from webgme on Wed Mar 16 2016 12:18:29 GMT-0700 (PDT).
 */

define(['js/Constants',
	'js/Utils/GMEConcepts',
	'blob/BlobClient',
	'js/NodePropertyNames',
	'q'
], function (CONSTANTS,
             GMEConcepts,
	     BlobClient,
             nodePropertyNames,
	     Q) {

    'use strict';

    var RootVizControl;

    RootVizControl = function (options) {

        this._logger = options.logger.fork('Control');

	this._blobClient = new BlobClient({logger: options.logger.fork('BlobClient')});
        this._client = options.client;

        // Initialize core collections and variables
        this._widget = options.widget;

        this._currentNodeId = null;
        this._currentNodeParentId = undefined;

        this._initWidgetEventHandlers();

        this._logger.debug('ctor finished');
    };

    RootVizControl.prototype._initWidgetEventHandlers = function () {
        this._widget.onNodeClick = function (id) {
            // Change the current active object
            WebGMEGlobal.State.registerActiveObject(id);
        };
    };

    /* * * * * * * * Visualizer content update callbacks * * * * * * * */
    // One major concept here is with managing the territory. The territory
    // defines the parts of the project that the visualizer is interested in
    // (this allows the browser to then only load those relevant parts).
    RootVizControl.prototype.selectedObjectChanged = function (nodeId) {
	var self = this;
	this._getObjectDescriptor(nodeId)
	    .then(function(desc) {

		self._logger.debug('activeObject nodeId \'' + nodeId + '\'');

		// Remove current territory patterns
		if (typeof self._currentNodeId === 'string') {
		    self._client.removeUI(self._territoryId);
		}

		self._currentNodeId = nodeId;
		self._currentNodeParentId = undefined;

		if (typeof desc.parentId === 'string') {
		    // Put new node's info into territory rules
		    self._selfPatterns = {};
		    self._selfPatterns[nodeId] = {children: 0};  // Territory "rule"

		    self._currentNodeParentId = desc.parentId;

		    self._territoryId = self._client.addUI(self, function (events) {
			self._eventCallback(events);
		    });

		    // Update the territory
		    self._client.updateTerritory(self._territoryId, self._selfPatterns);

		    self._selfPatterns[nodeId] = {children: 1};
		    self._client.updateTerritory(self._territoryId, self._selfPatterns);
		}
	    });
    };

    // This next function retrieves the relevant node information for the widget
    RootVizControl.prototype._getObjectDescriptor = function (nodeId) {
	var self = this;
        var nodeObj = self._client.getNode(nodeId),
        objDescriptor;

	return new Promise(function(resolve,reject) {
            if (nodeObj) {
		var metaObj = self._client.getNode(nodeObj.getMetaTypeId()),
		metaName = undefined;
		if (metaObj) {
		    metaName = metaObj.getAttribute(nodePropertyNames.Attributes.name);
		}

		objDescriptor = {
                    'id': undefined,
                    'name': undefined,
		    'meta': undefined,
                    'childrenIds': undefined,
                    'parentId': undefined,
                    'isConnection': false
		};

		objDescriptor.id = nodeObj.getId();
		objDescriptor.name = nodeObj.getAttribute(nodePropertyNames.Attributes.name);
		objDescriptor.icon = undefined;
		objDescriptor.brief = nodeObj.getAttribute('Brief Description');
		objDescriptor.detailed = nodeObj.getAttribute('Detailed Description');
		objDescriptor.authors = nodeObj.getAttribute('Authors');
		objDescriptor.meta = metaName;
		objDescriptor.childrenIds = nodeObj.getChildrenIds();
		objDescriptor.childrenNum = objDescriptor.childrenIds.length;
		objDescriptor.parentId = nodeObj.getParentId();
		objDescriptor.isConnection = GMEConcepts.isConnection(nodeId);  // GMEConcepts can be helpful
		var iconHash = nodeObj.getAttribute('Icon');
		if (iconHash) {
		    self._blobClient.getObjectAsString(iconHash)
			.then(function(data) {
			    objDescriptor.icon = data;
			    resolve(objDescriptor);
			})
			.catch(function(err) {
			    console.error('Couldnt get icon for ' + objDescriptor.name);
			    console.error(err);
			    resolve(objDescriptor);
			});
		}
		else {
		    resolve(objDescriptor);
		}
            }
	    else {
		resolve(objDescriptor);
	    }
	});
    };

    /* * * * * * * * Node Event Handling * * * * * * * */
    RootVizControl.prototype._eventCallback = function (events) {
        var i = events ? events.length : 0,
            event;

        this._logger.debug('_eventCallback \'' + i + '\' items');

        while (i--) {
            event = events[i];
            switch (event.etype) {
                case CONSTANTS.TERRITORY_EVENT_LOAD:
                    this._onLoad(event.eid);
                    break;
                case CONSTANTS.TERRITORY_EVENT_UPDATE:
                    this._onUpdate(event.eid);
                    break;
                case CONSTANTS.TERRITORY_EVENT_UNLOAD:
                    this._onUnload(event.eid);
                    break;
                default:
                    break;
            }
        }

        this._logger.debug('_eventCallback \'' + events.length + '\' items - DONE');
    };

    RootVizControl.prototype._onLoad = function (gmeId) {
	var self = this;
        this._getObjectDescriptor(gmeId)
	    .then(function(description) {
		self._widget.addNode(description);
	    });
    };

    RootVizControl.prototype._onUpdate = function (gmeId) {
	var self=this;
        this._getObjectDescriptor(gmeId)
	    .then(function(description) {
		self._widget.updateNode(description);
	    });
    };

    RootVizControl.prototype._onUnload = function (gmeId) {
        this._widget.removeNode(gmeId);
    };

    RootVizControl.prototype._stateActiveObjectChanged = function (model, activeObjectId) {
	if (this._currentNodeId === activeObjectId) {  
	    // The same node selected as before - do not trigger  
	} else {  
	    this.selectedObjectChanged(activeObjectId);  
	}  
    };

    /* * * * * * * * Visualizer life cycle callbacks * * * * * * * */
    RootVizControl.prototype.destroy = function () {
        this._detachClientEventListeners();
    };

    RootVizControl.prototype._attachClientEventListeners = function () {
        this._detachClientEventListeners();
        WebGMEGlobal.State.on('change:' + CONSTANTS.STATE_ACTIVE_OBJECT, this._stateActiveObjectChanged, this);
    };

    RootVizControl.prototype._detachClientEventListeners = function () {
        WebGMEGlobal.State.off('change:' + CONSTANTS.STATE_ACTIVE_OBJECT, this._stateActiveObjectChanged);
    };

    RootVizControl.prototype.onActivate = function () {
        this._attachClientEventListeners();
	if (typeof this._currentNodeId === 'string') {  
	    WebGMEGlobal.State.registerActiveObject(
		this._currentNodeId,
		{ suppressVisualizerFromNode: true }
	    );
	}  
    };

    RootVizControl.prototype.onDeactivate = function () {
        this._detachClientEventListeners();
    };

    return RootVizControl;
});
