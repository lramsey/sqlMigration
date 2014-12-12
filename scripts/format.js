var _ = require('lodash');
var when = require('when');
var buffer = require('buffer').Buffer;
var MySQL = require('../utility/util');

function prepareComparers(items, row){
    var comparers = [];
    items.forEach(function(item){
        var keys = item.split(',');
        var key = keys[0];
        var value;
        if(keys.length>1){
            value = row[keys[1]];
        } else{
            value = row[key];
        }
        if(value === undefined){
            var stop = 'stop';
        }
        var comparer;
        if(value === null){
            comparer = key + " IS null";
        } else{
            value = JSON.stringify(value);
            comparer = key + "=" + value;
        }
        comparers.push(comparer);
    });
    return comparers;
}

MySQL.prototype.rowEach = function(table, targets, dependentTables, conflictFields){
    var rowCount = 0;
    var id = 1;
    var dones = 0;
    var keychanges = 0;
    var news = 0;
    var conflicts = 0;
    var glgamesRow;
    var glasslabgamesRow;
    var comparers;
    var foreignKey;
    var newForeignKey;
    var playfully_prod_live = new MySQL('playfully_prod_live');
    return when.promise(function(resolve, reject){
        this.countRowsInTable(table)
            .then(function(count){
                rowCount = count;
                function recursor(){
                    return when.promise(function(resolve, reject){
                        if(rowCount > 0){
                            this.selectRowById(table, id)
                                .then(function(output){
                                    glgamesRow = output;
                                    if(glgamesRow !== undefined){
                                        _(glgamesRow).forEach(function(value, key){
                                            if(buffer.isBuffer(value)){
                                                glgamesRow[key] = value.toJSON()[0];
                                            }
                                        });
                                        //console.log("glgamesRow:",glgamesRow);
                                        rowCount--;
                                        comparers = prepareComparers(targets, glgamesRow);
                                        return playfully_prod_live.hasMatch(table, comparers)
                                    }
                                    return "no row at id";
                                }.bind(this))
                                .then(function(output){
                                    if(output === "no row at id"){
                                        return 'skip';
                                    } else if(output){
                                        glasslabgamesRow = output;
                                        if(glgamesRow.ID){
                                            comparers.push("ID=" + glgamesRow.ID);
                                        } else{
                                            comparers.push("id=" + glgamesRow.id);
                                        }
                                        return playfully_prod_live.hasMatch(table, comparers);
                                    } else if(conflictFields.length > 0) {
                                        // check for conflicts as well, eventually. not match but could have some matching columns
                                        comparers = prepareComparers(conflictFields, glgamesRow);
                                        return playfully_prod_live.conflictCheck(table, comparers);
                                    } else{
                                        return "new";
                                    }
                                }.bind(this))
                                .then(function(output){
                                    var status;
                                    if(output === "new"){
                                        status = '"new"';
                                        news++;
                                    } else if(output === "conflict"){
                                        status = '"conflict"';
                                        conflicts++;
                                    } else if(typeof output === 'object'){
                                        status = '"done"';
                                        dones++;
                                    } else if(output === false){
                                        status = '"key-change"';
                                        keychanges++;
                                    }
                                    if(output !== "skip"){
                                        var newId;
                                        if(status === '"new"'|| status === '"conflict"'){
                                            newId = -1;
                                        } else{
                                            newId = glasslabgamesRow || glgamesRow;
                                            newId = newId.ID || newId.id;
                                        }
                                        newForeignKey = newId;
                                        newId = "new_id = " + newId;
                                        var id = glgamesRow.ID || glgamesRow.id;
                                        foreignKey = id;
                                        status = "status = " + status;
                                        id = "id = " + id;
                                        var columnsToUpdate = [status, newId];
                                        var whereConditions = [id];
                                        //console.log("status:", status);
                                        return this.updateColumns(table, columnsToUpdate, whereConditions);
                                    }
                                    return true;
                                }.bind(this))
                                .then(function(hasSkipped){
                                    if(!hasSkipped){
                                        var updateForeignKeys = [];
                                        var tableId = table.split('_')[1].toLowerCase() + "_id";
                                        var newTableId = "new_" + tableId + " = " + newForeignKey;
                                        var columnsToUpdate = [newTableId];
                                        tableId = tableId + " = " + foreignKey;
                                        var whereConditions = [tableId];
                                        dependentTables.forEach(function(dependentTable){
                                            updateForeignKeys.push(this.updateColumns(dependentTable, columnsToUpdate, whereConditions));
                                        }.bind(this));
                                        return when.all(updateForeignKeys);
                                    }
                                }.bind(this))
                                .then(function(){
                                    id++;
                                    return recursor.call(this);
                                }.bind(this))
                                .then(function(){
                                    resolve();
                                })
                                .then(null, function(err){
                                    console.log(err);
                                    reject(err);
                                });
                        } else{
                            console.log();
                            console.log(table,'Statuses');
                            console.log('  done:',dones);
                            console.log('  key-change:',keychanges);
                            console.log('  new:',news);
                            console.log('  conflict:',conflicts);
                            console.log('______________________________');
                            resolve();
                        }
                    }.bind(this));
                }
                return recursor.call(this);
            }.bind(this))
            .then(function(){
                resolve();
            })
            .then(null, function(err){
                console.log('error:', err);
                reject(err);
            });
    }.bind(this));
};

MySQL.prototype.hasMatch = function(table, comparers){
    return when.promise(function(resolve, reject){
        var comparison = comparers.join(' and ');
        var Q = "SELECT * FROM " + this.options.database + "." + table + " WHERE " + comparison + ";";
        this.query(Q)
            .then(function(output){
                var row = output[0];
                if(row){
                    resolve(row);
                } else{
                    resolve(false);
                }
            })
            .then(null, function(err){
                reject(err);
            })
    }.bind(this));
};

MySQL.prototype.conflictCheck = function(table, comparers){
    return when.promise(function(resolve, reject){
        var comparison = comparers.join(' or ');
        var Q = "SELECT * FROM " + this.options.database + "." + table + " WHERE " + comparison + ";";
        this.query(Q)
            .then(function(output){
                var row = output[0];
                if(row){
                    resolve('conflict');
                } else{
                    resolve('new');
                }
            })
            .then(null, function(err){
                reject(err);
            })
    }.bind(this));
};

MySQL.prototype.format = function(){
    console.log('start migration script');
    var table = "GL_INSTITUTION";
    var targets = ["TITLE", "code", "CITY"];
    var dependentTables = ["GL_USER", "GL_COURSE", "GL_CODE"];
    var conflictFields = [];
    this.rowEach(table, targets, dependentTables, conflictFields)
        .then(function(){
            table = "GL_COURSE";
            targets = ["code", "institution_id,new_institution_id", "TITLE"];
            dependentTables = ["GL_CODE", "GL_MEMBERSHIP"];
            conflictFields = [];
            return this.rowEach(table, targets, dependentTables, conflictFields);
        }.bind(this))
        .then(function(){
            table = "GL_CODE";
            targets = ["CODE", "course_id,new_course_id", "institution_id,new_institution_id"];
            dependentTables = [];
            conflictFields = [];
            return this.rowEach(table, targets, dependentTables, conflictFields);
        }.bind(this))
        .then(function(){
            table = "GL_USER";
            targets = ["EMAIL", "FIRST_NAME", "institution_id,new_institution_id", "LAST_NAME", "USERNAME"];
            dependentTables = ["GL_MEMBERSHIP"];
            conflictFields = ["USERNAME"];
            return this.rowEach(table, targets, dependentTables, conflictFields);
        }.bind(this))
        .then(function(){
            table = "GL_MEMBERSHIP";
            targets = ["course_id,new_course_id", "user_id,new_user_id"];
            dependentTables = [];
            conflictFields = [];
            return this.rowEach(table, targets, dependentTables, conflictFields);
        }.bind(this))
        .then(function(){
            console.log("done");
        })
        .then(null, function(err){
            console.log(err);
        });
};

var playfully_prod = new MySQL('playfully_prod');
module.exports = playfully_prod.format.bind(playfully_prod);
