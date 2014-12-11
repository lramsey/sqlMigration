sqlMigration
============

Script to carry out mysql table migration at Glass Lab.  A config.json file needs to be created containing the mysql user and password information, as it is not hard coded in.  Before running the script, make sure that the five tables have all of their proper new columns added, such as status, new_id, and any relevant new_foreignkey_id.  Also, be sure to npm install before running.
