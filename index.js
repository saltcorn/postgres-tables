const { getConnection } = require("./connections");

module.exports = {
  sc_plugin_api_version: 1,
  table_providers: require("./table-provider.js"),
  viewtemplates: [require("./database-browser")],
  ready_for_mobile: true,
  functions: {
    extPgSqlQuery: {
      run: async (connection, query, parameters) => {
        const sql_log = (...args) => {
          console.log(...args);
        };
        const pool = await getConnection(connection);
        const client = await pool.connect();
        sql_log("BEGIN;");
        await client.query(`BEGIN;`);
        if (connection.schema) {
          sql_log(`SET LOCAL search_path TO "${connection.schema}";`);
          await client.query(
            `SET LOCAL search_path TO "${connection.schema}";`,
          );
        }
        sql_log(`SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY;`);
        await client.query(
          `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY;`,
        );

        sql_log(query, parameters || []);
        const qres = await client.query(query, parameters || []);
        sql_log("ROLLBACK;");
        await client.query(`ROLLBACK;`);
        client.release();
        return qres;
      },
      isAsync: true,
      description: "Run an SQL query",
      arguments: [
        {
          name: "connection",
          type: "JSON",
          tstype:
            "{host: string, port: number, user: string, password: string, database: string, schema: string}",
          required: true,
        },
        { name: "sql_query", type: "String", required: true },
        { name: "parameters", type: "JSON", tstype: "any[]" },
      ],
    },
  },
};
