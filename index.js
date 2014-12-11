var _ = require('lodash');
var when = require('when');
var mysql = require('mysql');
var buffer = require('buffer').Buffer;

function MySQL(database){
    var config = require(__dirname + "/config.json");
    this.options =
    {
        host: "localhost",
        user: config.user,
        password: config.password,
        database: database,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 100000
    };
    this.pool = mysql.createPool(this.options);
}

MySQL.prototype.query = function(query) {
// add promise wrapper
    return when.promise(function(resolve, reject) {
// ------------------------------------------------

        this.pool.getConnection(function(err, connection) {
            if(err) {
                reject(err);
                return;
            }

            connection.query(query, function(err, data) {
                connection.release();

                if(err) {
                    reject(err);
                    return;
                }

                resolve(data);
            });
        });

// ------------------------------------------------
    }.bind(this));
// end promise wrapper
};

MySQL.prototype.countRowsInTable = function(table){
    return when.promise(function(resolve, reject){
        var Q = "SELECT COUNT(*) FROM " + this.options.database + "." + table + ";";
        this.query(Q)
            .then(function(output){
                var count = output[0]["COUNT(*)"];
                resolve(count);
            }.bind(this))
            .then(null, function(err){
                reject(err);
            });
    }.bind(this));
};

MySQL.prototype.selectRowById = function(table, id){
    return when.promise(function(resolve, reject){
        var Q = "SELECT * FROM " + this.options.database + "." + table + " WHERE id=" + id + ";";
        this.query(Q)
            .then(function(output){
                var row = output[0];
                resolve(row);
            }.bind(this))
            .then(null, function(err){
                reject(err);
            }.bind(this))
    }.bind(this));
};

MySQL.prototype.rowEach = function(table, targets, dependentTables){
    var rowCount = 0;
    var id = 1;
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
                                        console.log("glgamesRow:",glgamesRow);
                                        rowCount--;
                                        comparers = [];
                                        targets.forEach(function(key){
                                            var comparer;
                                            var value = glgamesRow[key];
                                            if(value === null){
                                                comparer = key + " IS null";
                                            } else{
                                                value = JSON.stringify(glgamesRow[key]);
                                                comparer = key + "=" + value;
                                            }
                                            comparers.push(comparer)
                                        });
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
                                        return playfully_prod_live.hasMatch(table,comparers);
                                    } else {
                                        // check for conflicts as well, eventually. not match but could have some matching columns
                                        return "new";
                                    }
                                }.bind(this))
                                .then(function(output){
                                    var status;
                                    if(output === "new"){
                                        status = '"new"';
                                    } else if(output){
                                        status = '"done"';
                                    } else if(output === false){
                                        status = '"key-change"';
                                    }
                                    if(output !== "skip"){
                                        var newId;
                                        if(status === '"new"'){
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
                                        console.log("status:", status);
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

MySQL.prototype.start = function(){
    var table = "GL_INSTITUTION";
    var targets = ["TITLE", "code", "CITY"];
    var dependentTables = ["GL_USER", "GL_COURSE", "GL_CODE"];
    this.rowEach(table, targets, dependentTables)
        .then(function(){
            table = "GL_COURSE";
            targets = ["code", "institution_id", "TITLE"];
            dependentTables = ["GL_CODE", "GL_MEMBERSHIP"];
            return this.rowEach(table, targets, dependentTables);
        }.bind(this))
        .then(function(){
            table = "GL_CODE";
            targets = ["CODE", "course_id", "institution_id"];
            dependentTables = [];
            return this.rowEach(table, targets, dependentTables);
        }.bind(this))
        .then(function(){
            table = "GL_USER";
            targets = ["EMAIL", "FIRST_NAME", "institution_id", "LAST_NAME", "USERNAME"];
            dependentTables = ["GL_MEMBERSHIP"];
            return this.rowEach(table, targets, dependentTables);
        }.bind(this))
        .then(function(){
            table = "GL_MEMBERSHIP";
            targets = ["course_id", "user_id"];
            dependentTables = [];
            return this.rowEach(table, targets, dependentTables);
        }.bind(this))
        .then(function(){
            console.log("done");
        })
        .then(null, function(err){
            console.log(err);
        });
};

MySQL.prototype.updateColumns = function(table, columnsToUpdate, whereConditions){
    return when.promise(function(resolve, reject){
        var setLanguage = columnsToUpdate.join(', ');
        var whereLanguage = whereConditions.join(' and ');
        //UPDATE playfully_prod.GL_INSTITUTION SET enabled = 1 WHERE id = 1;
        var Q = "UPDATE " + this.options.database + "." + table +
            " SET " + setLanguage + " WHERE " + whereLanguage + ";";
        this.query(Q)
            .then(function(){
                resolve();
            })
            .then(null, function(err){
                reject(err);
            })
    }.bind(this))
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


//var valuesToCheck
//selectRow('playfully_prod_live', 'GL_INSTITUTION', 3);
//rowEach('playfully_prod_live', 'GL_INSTITUTION');
//var playfully_prod_live = new MySQL('playfully_prod_live');
var playfully_prod = new MySQL('playfully_prod');
playfully_prod.start();

