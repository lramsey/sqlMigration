sqlMigration
============

Script to carry out mysql table migration at Glass Lab.  A config.json file needs to be created containing the mysql user and password information, as it is not hard coded in.  Before running the script, make sure that the five tables have all of their proper new columns added, such as status, new_id, and any relevant new_foreignkey_id.  Also, be sure to npm install before running.

There are two separate scripts in the index.js file.  One for formatting the tables before migration, and the other for carrying out the migration.