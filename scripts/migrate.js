var _ = require('lodash');
var when = require('when');
var MySQL = require('../utility/util');

function buildNotMigratingColumns(){
    var notMigrating = {};
    notMigrating.id = true;
    notMigrating.ID = true;
    return notMigrating;
}

MySQL.prototype.migrateEach = function(table, notMigrating, dependentTables){
    return when.promise(function(resolve, reject){
        var rowCount = 0;
        var id = 1;
        var glgamesRow;
        var playfully_prod_live = new MySQL('playfully_prod_live');
        this.countRowsInTable(table)
            .then(function(count){
                rowCount = count;
                function recursor(){
                    return when.promise(function(resolve, reject){
                        if(rowCount > 0) {
                            this.selectRowById(table, id)
                                .then(function (output) {
                                    glgamesRow = output;
                                    if (glgamesRow !== undefined) {
                                        _(glgamesRow).forEach(function (value, key) {
                                            if (buffer.isBuffer(value)) {
                                                glgamesRow[key] = value.toJSON()[0];
                                            }
                                        });
                                        //console.log("glgamesRow:",glgamesRow);
                                        rowCount--;
                                        // continue logic here, selected a row
                                    }
                                    return "no row at id";
                                }.bind(this))
                        }
                    }.bind(this))
                }
                return recursor.call(this);
            }.bind(this))

    }.bind(this));
};

MySQL.prototype.migrate = function(){
    console.log('start migration script');
    var table = "GL_INSTITUTION";
    var notMigrating = notMigratingColumns();
    var dependentTables = ['GL_USER', 'GL_COURSE', 'GL_CODE'];
    this.migrateEach(table, notMigrating, dependentTables)
        .then(function(){
            table = "GL_COURSE";
            notMigrating = buildNotMigratingColumns();
            notMigrating["institution_id"] = true;
            dependentTables = ["GL_CODE", "GL_MEMBERSHIP"];
            return this.migrateEach(table, notMigrating, dependentTables);
        }.bind(this))
        .then(function(){
            table = "GL_CODE";
            notMigrating = buildNotMigratingColumns();
            notMigrating["institution_id"] = true;
            notMigrating["course_id"] = true;
            dependentTables = [];
            return this.migrateEach(table, notMigrating, dependentTables);
        }.bind(this))
        .then(function(){
            table = "GL_USER";
            notMigrating = buildNotMigratingColumns();
            notMigrating["institution_id"] = true;
            dependentTables = ["GL_MEMBERSHIP"];
            return this.migrateEach(table, notMigrating, dependentTables);
        }.bind(this))
        .then(function(){
            table = "GL_MEMBERSHIP";
            notMigrating = buildNotMigratingColumns();
            notMigrating["user_id"] = true;
            notMigrating["course_id"] = true;
            dependentTables = [];
            return this.migrateEach(table, notMigrating, dependentTables);
        }.bind(this))
        .then(function(){
            console.log('migration complete');
        })
        .then(null, function(err){
            console.log('migration error -', err);
        });
};



var playfully_prod = new MySQL('playfully_prod');
module.exports = playfully_prod.migrate.bind(playfully_prod);
