/*globals define, WebGMEGlobal*/
/*jshint browser: true*/

/**
 * Generated by VisualizerGenerator 0.1.0 from webgme on Wed Mar 16 2016 12:18:29 GMT-0700 (PDT).
 */

define([
    'text!./RootViz.html',
    'js/DragDrop/DropTarget',
    'js/DragDrop/DragConstants',
    'common/util/ejs',
    './Templates',
    'js/Utils/GMEConcepts',
    'js/NodePropertyNames',
    'css!./styles/RootVizWidget.css'
], function (
    RootVizHtml,
    dropTarget,
    DROP_CONSTANTS,
    ejs,
    TEMPLATES,
    GMEConcepts,
    nodePropertyNames) {
    'use strict';

    var RootVizWidget,
        WIDGET_CLASS = 'root-viz';

    RootVizWidget = function (logger, container, client) {
        this._logger = logger.fork('Widget');

        this.$el = container;

	this._client = client;

        this.nodes = {};

        this._initialize();
	this._makeDroppable();

        this._logger.debug('ctor finished');
    };

    RootVizWidget.prototype._initialize = function () {
        // set widget class
        this.$el.addClass(WIDGET_CLASS);
        this.$el.append(RootVizHtml);
	this.$table = this.$el.find('#rootVizTable');

	this._nodes = [];
	this._numNodes = 0;
	this._currentRow = 0;
	this._tableSetup = false;
    };

    RootVizWidget.prototype.setupTable = function() {
	var sizeOfElement = 300;
        var width = this.$el.width(),
            height = this.$el.height();
	this._numElementsPerRow = Math.floor(width / sizeOfElement);
	this.$table.empty();
	this.$table.append('<colgroup>');
	for (var i=0;i<this._numElementsPerRow;i++)
	    this.$table.append('<col width="'+100/this._numElementsPerRow+'%" height="auto">');
	this.$table.append('</colgroup>');
	this._tableSetup = true;
    };

    RootVizWidget.prototype.createNodeEntry = function (desc) {
	var row,
	column,
	projectHtml,
	panelId,
	title,
	authors,
	brief,
	detailed,
	htmlId,
	html;
	
	if (!this._tableSetup)
	    this.setupTable();

	if ((this._numNodes % this._numElementsPerRow) == 0) {
	    this._currentRow++;
	    this.$table.append('<tr id="rowClass'+this._currentRow+'"></tr>');
	}
	row = this.$el.find('#rowClass' + this._currentRow);
	row.append('<td style="vertical-align: top" id="colClass'+this._numNodes+'"></td>');
	column = this.$el.find('#colClass' + this._numNodes);

	title = desc.name;
	panelId = title.replace(/ /g,'-');
	authors = desc.authors;
	brief = desc.brief;
	detailed = desc.detailed;
	projectHtml = ejs.render(TEMPLATES['Project.html.ejs'], {
	    id: panelId,
	    title: title,
	    authors: authors,
	    brief: brief,
	    detailed: detailed
	});

	column.append(projectHtml);

	htmlId = panelId + '-node-panel';
	html = this.$el.find('#' + htmlId);

	html.addClass('panel-info');
	html.on('mouseenter', (event) => {
	    html.addClass('panel-primary');
	    html.removeClass('panel-info');
	});
	html.on('mouseleave', (event) => {
	    html.addClass('panel-info');
	    html.removeClass('panel-primary');
	});
	html.on('click', (event) => {
	    this.onNodeClick(desc.id);
	    event.stopPropagation();
	    event.preventDefault();
	});
	this._numNodes++;
    };

    RootVizWidget.prototype.onWidgetContainerResize = function (width, height) {
       /*
       this._logger.error('RESIZING:: ' + width + ' ' + height);
       this._initialize(width);
       this._nodes.map(function(desc) {
           this.createNodeEntry(desc);
       });
       */
    };

    // Adding/Removing/Updating items
    var NODE_WHITELIST = {
        Project: true
    };
    RootVizWidget.prototype.addNode = function (desc) {

        if (desc) {
	    var isValid = NODE_WHITELIST[desc.meta];

            if (isValid) {
		//this._nodes.push(desc);
		this.createNodeEntry(desc);
            }
        }
    };

    RootVizWidget.prototype.removeNode = function (gmeId) {
	if (this.nodes[gmeId]) {
            delete this.nodes[gmeId];
	}
    };

    RootVizWidget.prototype.updateNode = function (desc) {
    };

    RootVizWidget.prototype._isValidDrop = function (dragInfo) {
	var self = this;
        var result = false,
        draggedNodePath,
	nodeObj,
	nodeName,
	metaObj,
	metaName;

        if (dragInfo[DROP_CONSTANTS.DRAG_ITEMS].length === 1) {
            draggedNodePath = dragInfo[DROP_CONSTANTS.DRAG_ITEMS][0];
	    nodeObj = self._client.getNode(draggedNodePath);
	    nodeName = nodeObj.getAttribute('name');
	    metaObj = self._client.getNode(nodeObj.getMetaTypeId());
	    if (metaObj) {
		metaName = metaObj.getAttribute('name');
	    }
            result = metaName && metaName == 'Project';
        }

        return result;
    };


    // This next function retrieves the relevant node information for the widget
    RootVizWidget.prototype._getObjectDescriptor = function (nodeId) {
        var nodeObj = this._client.getNode(nodeId),
            objDescriptor;

        if (nodeObj) {
	    var metaObj = this._client.getNode(nodeObj.getMetaTypeId()),
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
	    objDescriptor.brief = nodeObj.getAttribute('Brief Description');
	    objDescriptor.detailed = nodeObj.getAttribute('Detailed Description');
	    objDescriptor.authors = nodeObj.getAttribute('Authors');
	    objDescriptor.meta = metaName;
            objDescriptor.childrenIds = nodeObj.getChildrenIds();
            objDescriptor.childrenNum = objDescriptor.childrenIds.length;
            objDescriptor.parentId = nodeObj.getParentId();
            objDescriptor.isConnection = GMEConcepts.isConnection(nodeId);  // GMEConcepts can be helpful
        }

        return objDescriptor;
    };

    RootVizWidget.prototype.createProject = function(basePath) {
	var client = this._client;
	var nodeId = '', // root node always exists and always has path ''
	baseId = client.getNode(basePath).getId();
	var childCreationParams = {
	    parentId: nodeId,  // Should be ROOT
	    baseId: baseId,    // should be META:Project
	};
	var childId = client.createChild(childCreationParams, 'Creating new Project');
	return childId;
    };

    /* * * * * * * * Visualizer event handlers * * * * * * * */

    RootVizWidget.prototype._makeDroppable = function () {
	var self = this,
	newProjectId,
	desc;
        self.$el.addClass('drop-area');
        //self._div.append(self.__iconAssignNullPointer);

        dropTarget.makeDroppable(self.$el, {
            over: function (event, dragInfo) {
                if (self._isValidDrop(dragInfo)) {
                    self.$el.addClass('accept-drop');
                } else {
                    self.$el.addClass('reject-drop');
                }
            },
            out: function (/*event, dragInfo*/) {
                self.$el.removeClass('accept-drop reject-drop');
            },
            drop: function (event, dragInfo) {
                if (self._isValidDrop(dragInfo)) {
		    newProjectId = self.createProject(dragInfo[DROP_CONSTANTS.DRAG_ITEMS][0]);
                }
                self.$el.removeClass('accept-drop reject-drop');
            }
        });
    };

    RootVizWidget.prototype.onNodeClick = function (id) {
        // This currently changes the active node to the given id and
        // this is overridden in the controller.
    };

    RootVizWidget.prototype.onBackgroundDblClick = function () {
    };

    /* * * * * * * * Visualizer life cycle callbacks * * * * * * * */
    RootVizWidget.prototype.destroy = function () {
    };

    RootVizWidget.prototype.onActivate = function () {
    };

    RootVizWidget.prototype.onDeactivate = function () {
    };

    return RootVizWidget;
});
