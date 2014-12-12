var mysql = require('mysql');
var when = require('when');

function MySQL(database){
    var config = require(__dirname + "/../config.json");
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

module.exports = MySQL;
