/*globals define, WebGMEGlobal*/
/*jshint browser: true*/

/**
 * Generated by VisualizerGenerator 0.1.0 from webgme on Mon Mar 21 2016 15:35:55 GMT-0700 (PDT).
 */

define([
    'js/Widgets/DiagramDesigner/DiagramDesignerWidget',
    'js/Widgets/DiagramDesigner/DiagramDesignerWidget.Tabs',
    './SelectionManager',
    'rosmod/Libs/cm/lib/codemirror', 'rosmod/Libs/cm/mode/clike/clike',
    'rosmod/Libs/cm/keymap/emacs', 'rosmod/Libs/cm/keymap/sublime', 'rosmod/Libs/cm/keymap/vim',
    'rosmod/Libs/cm/addon/display/fullscreen',
    'css!rosmod/Libs/cm/addon/display/fullscreen.css',
    'css!rosmod/Libs/cm/theme/night.css',
    'css!rosmod/Libs/cm/lib/codemirror.css',
    'css!./styles/CodeMirrorVizWidget.css'
], function (
    DiagramDesigner,
    DiagramDesignerTabs,
    SelectionManager,
    CodeMirror,
    CodeMirrorModeClike,
    CodeMirrorEmacsKeymap, CodeMirrorSublimeKeymap, CodeMirrorVimKeymap,
    CodeMirrorFullScreen
) {
    'use strict';

    var CodeMirrorVizWidget,
    WIDGET_CLASS = 'code-mirror-viz';

    CodeMirrorVizWidget = function (logger, container, options) {
	var selectionManager = new SelectionManager({widget:this}),
	options = {
	    selectionManager: selectionManager
	};

	DiagramDesigner.call(this, container, options);
	
        this.logger = logger.fork('Widget');
	
	this._dialog = null;
        this.logger.debug('ctor finished');
    };

    _.extend(CodeMirrorVizWidget.prototype, DiagramDesigner.prototype);

    CodeMirrorVizWidget.prototype._onSelectionCommandClicked = function(command, selectedIds, event) {
	switch(command) {
	    case 'inspect':
	    this.showInspector(selectedIds[0]);
	    break;

	    default:
	    DiagramDesigner.prototype._onSelectionCommandClicked
	    .call(this, command, selectedIds, event);
	    break;
	}
    };

    CodeMirrorVizWidget.prototype.onWidgetContainerResize = function (width, height) {
        console.log('Widget is resizing...');
    };

    // Adding/Removing/Updating items
    CodeMirrorVizWidget.prototype.addNode = function (desc) {
	return;
        if (desc) {
            // Add node to a table of nodes
            var node = document.createElement('div'),
                label = 'children';

            if (desc.childrenIds.length === 1) {
                label = 'child';
            }

            this.nodes[desc.id] = desc;
            node.innerHTML = 'Adding node "' + desc.name + '" (click to view). It has ' + 
                desc.childrenIds.length + ' ' + label + '.';

            this._el.append(node);
            node.onclick = this.onNodeClick.bind(this, desc.id);
        }
    };

    CodeMirrorVizWidget.prototype.removeNode = function (gmeId) {
        var desc = this.nodes[gmeId];
        this._el.append('<div>Removing node "'+desc.name+'"</div>');
        delete this.nodes[gmeId];
    };

    CodeMirrorVizWidget.prototype.updateNode = function (desc) {
        if (desc) {
            console.log('Updating node:', desc);
            this._el.append('<div>Updating node "'+desc.name+'"</div>');
        }
    };

    // * * * * * * * Visualizer event handlers * * * * * * * 

    CodeMirrorVizWidget.prototype.onNodeClick = function (id) {
        // This currently changes the active node to the given id and
        // this is overridden in the controller.
    };

    CodeMirrorVizWidget.prototype.onBackgroundDblClick = function () {
        this._el.append('<div>Background was double-clicked!!</div>');
    };

    //* * * * * * * * Visualizer life cycle callbacks * * * * * * * 
    CodeMirrorVizWidget.prototype.destroy = function () {
    };

    CodeMirrorVizWidget.prototype.onActivate = function () {
        console.log('CodeMirrorVizWidget has been activated');
    };

    CodeMirrorVizWidget.prototype.onDeactivate = function () {
        console.log('CodeMirrorVizWidget has been deactivated');
    };

    return CodeMirrorVizWidget;
});
