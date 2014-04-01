Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    tagPicker: null,

    items: [
        {
            xtype: 'container',
            itemId: 'widgets',
            columnWidth: 1
        },
        {
            xtype: 'container',
            itemId: 'gridContainer',
            columnWidth: 1
        }
    ],

    _artifactsWithTags: [],
    _artifactTagsGrid: null,

    launch: function() {

        var me = this;

        this.tagPicker = Ext.create('Rally.ui.picker.TagPicker', {
            itemId:'tagpicker'
        });


        this.down('#widgets').add(this.tagPicker);

        this.down('#widgets').add({
            xtype: 'rallybutton',
            text: 'Get Test Cases',
            itemId: 'get',
            margin: 2,
            handler: function() {
                me._getArtifacts();
            }
        },
        {
            xtype: 'rallybutton',
            text: 'Create Test Folders',
            itemId: 'create',
            margin: 2,
            disabled: true,
            handler: function() {
                me._getTestFolders();
            }
        });
    },
    
    _getTestFolders:function(){
        var me = this;
        Ext.create('Rally.data.wsapi.Store', {
                model: 'TestFolder',
                fetch: ['Name'],
                autoLoad: true,
                context: {
                    project: me.getContext().getProject(),
                    projectScopeDown: false,
                    projectScopeUp: false
                },
                listeners: {
                    load: this. _getNamesOfExistingFolders,
                    scope: this
                },
            });
    },
    
    _getNamesOfExistingFolders: function(store, records){
        console.log('existing testfolders', records);
        var me = this;
        me._existingFoldersNames = [];
        if (records.length > 0) {
            
            _.each(records, function(testfolder){
                me._existingFoldersNames.push(testfolder.get('Name'));
            });
        }
        me._createTestFolders();
        
    },
    
    _createTestFolders: function(){
        var me = this;
        console.log(me._existingFoldersNames);
        Rally.data.ModelFactory.getModel({
            type: 'TestFolder',
            success: function(model) {  
                _.each(me._tagNames, function(tagName){
                    var exists = _.find(me._existingFoldersNames, function(existingName){return tagName === existingName});
                        if (exists === undefined) {
                            var folder = Ext.create(model, {
                                Name: tagName
                            });
                            folder.save({
                                callback: function(result, operation) {
                                    if(operation.wasSuccessful()) {
                                        console.log("Created TestFolder: _ref",result.get('_ref'), ' ', result.get('Name'));
                                    }
                                    else{
                                        console.log("error");
                                    }
                                }
                            });
                        }
                    
                });
            }
        });
    },
    
    _getArtifacts: function() {
        this.down('#create').setDisabled(false);
        var me = this;
        var selectedTagRecords = this.tagPicker._getRecordValue();
        me._tagNames = [];
        
        if (selectedTagRecords.length > 0) {

            var myTagFilters = [];

            _.each(selectedTagRecords, function(thisTag) {
                var thisTagName = thisTag.get('Name');
                me._tagNames.push(thisTagName); 
                var thisFilter = {
                    property: 'Tags.Name',
                    operator: 'contains',
                    value: thisTagName
                };
                myTagFilters.push(thisFilter);
            });

            Ext.create('Rally.data.wsapi.Store', {
                model: 'TestCase',
                fetch: ['ObjectID', 'FormattedID', 'Name', 'Project', 'ScheduleState', 'Tags'],
                autoLoad: true,
                context: {
                    project: me.getContext().getProject(),
                    projectScopeDown: false,
                    projectScopeUp: false
                },
                listeners: {
                    load: this._onDataLoaded,
                    scope: this
                },
                filters: Rally.data.wsapi.Filter.or(myTagFilters)
            });
        }
    },

    _onDataLoaded: function(store, records) {
        var me = this;
        var promises = [];

        if (records.length === 0) {
            me._noArtifactsNotify();
        }

        Ext.Array.each(records, function(artifact) {
            promises.push(me._getArtifactTags(artifact, me));
        });

        Deft.Promise.all(promises).then({
            success: function(results) {
                me._artifactsWithTags = results;
                me._makeGrid();
            }
        });
    },

    _getArtifactTags: function(artifact, scope) {

        var deferred                = Ext.create('Deft.Deferred');
        var me                      = scope;

        var tags                    = [];

        var artifactRef             = artifact.get('_ref');
        var artifactObjectID        = artifact.get('ObjectID');
        var artifactFormattedID     = artifact.get('FormattedID');
        var artifactName            = artifact.get('Name');
        var artifactProject         = artifact.get('Project');
        var artifactScheduleState   = artifact.get('ScheduleState');
        var tagsCollection          = artifact.getCollection("Tags", {fetch: ['Name', 'ObjectID']});
        var tagCount                = tagsCollection.getCount();

        tagsCollection.load({
            callback: function(records, operation, success) {
                Ext.Array.each(records, function(tag) {
                    tags.push(tag);
                });
                result = {
                    "_ref"          : artifactRef,
                    "ObjectID"      : artifactObjectID,
                    "FormattedID"   : artifactFormattedID,
                    "Name"          : artifactName,
                    "Project"       : artifactProject._refObjectName,
                    "ScheduleState" : artifactScheduleState,
                    "Tags"          : tags
                };
                deferred.resolve(result);
            }
        });

        return deferred;
    },

    _makeGrid: function() {
        var me = this;

        if (me._artifactTagsGrid) {
            me._artifactTagsGrid.destroy();
        }

        var gridStore = Ext.create('Rally.data.custom.Store', {
            data: me._artifactsWithTags,
            pageSize: 1000,
            remoteSort: false
        });

        me._artifactTagsGrid = Ext.create('Rally.ui.grid.Grid', {
            itemId: 'artifactGrid',
            store: gridStore,

            columnCfgs: [
                {
                    text: 'Formatted ID', dataIndex: 'FormattedID', xtype: 'templatecolumn',
                    tpl: Ext.create('Rally.ui.renderer.template.FormattedIDTemplate')
                },
                {
                    text: 'Name', dataIndex: 'Name', flex: 1
                },
                {
                    text: 'Project', dataIndex: 'Project', flex: 1
                },
                {
                    text: 'Schedule State', dataIndex: 'ScheduleState', flex: 1
                },
                {
                    text: 'Tags', dataIndex: 'Tags',
                    renderer: function(values) {
                        var tagArray = [];
                        Ext.Array.each(values, function(tag) {
                            var tagName = tag.get('Name');
                            tagArray.push(tagName);
                        });
                        return tagArray.join(', ');
                    },
                    flex: 1
                }
            ]
        });

        me.down('#gridContainer').add(me._artifactTagsGrid);
        me._artifactTagsGrid.reconfigure(gridStore);
    },


    _noArtifactsNotify: function() {
        this._artifactTagsGrid = this.down('#gridContainer').add({
            xtype: 'container',
            html: "No Artifacts found matching selected Tags."
        });
    },
 });