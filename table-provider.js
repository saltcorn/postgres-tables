const { eval_expression } = require("@saltcorn/data/models/expression");
const Workflow = require("@saltcorn/data/models/workflow");
const Form = require("@saltcorn/data/models/form");
const FieldRepeat = require("@saltcorn/data/models/fieldrepeat");
const Field = require("@saltcorn/data/models/field");
const Table = require("@saltcorn/data/models/table");
const { discover_tables } = require("@saltcorn/data/models/discovery");
const { getState } = require("@saltcorn/data/db/state");
const { mkTable } = require("@saltcorn/markup");
const { pre, code } = require("@saltcorn/markup/tags");
const { deleteWhere, count, select } = require("@saltcorn/postgres/postgres")(
  null
);

const { Pool } = require("pg");

const pools = {};

const getConnection = async (connStr) => {
  if (!connStr) return null;
  const connectionString = typeof connStr === "object" ? getConnStr(connStr) : connStr;
  if (!pools[connectionString]) pools[connectionString] = new Pool({connectionString});
  return pools[connectionString];
};

const getConnStr = ({ host, user, password, port, database }) =>
  `postgresql://${user}:${password}@${host}:${port}/${database}`;

const configuration_workflow = (req) =>
  new Workflow({
    steps: [
      {
        name: "table",
        form: async () => {
          return new Form({
            fields: [
              {
                name: "host",
                label: "Host URL",
                type: "String",
                required: true,
              },
              {
                name: "port",
                label: "Port",
                type: "Integer",
                required: true,
                default: 5432,
              },
              {
                name: "user",
                label: "User",
                type: "String",
                required: true,
              },
              {
                name: "password",
                label: "Password",
                type: "String",
                fieldview: "password",
                required: true,
              },
              {
                name: "database",
                label: "Database",
                type: "String",
                required: true,
              },
              {
                name: "schema",
                label: "Schema",
                type: "String",
              },
              {
                name: "table_name",
                label: "Table name",
                type: "String",
                required: true,
              },
            ],
          });
        },
      },
      {
        name: "fields",
        form: async (ctx) => {
          const pool = await getConnection(ctx);
          const pack = await discover_tables(
            [ctx.table_name],
            ctx.schema,
            pool
          );
          const tables = await Table.find({});

          const fkey_opts = ["File", ...tables.map((t) => `Key to ${t.name}`)];

          const form = new Form({
            fields: [
              {
                input_type: "section_header",
                label: "Column types",
              },
              new FieldRepeat({
                name: "fields",
                fields: [
                  {
                    name: "name",
                    label: "Name",
                    type: "String",
                    required: true,
                  },
                  {
                    name: "label",
                    label: "Label",
                    type: "String",
                    required: true,
                  },
                  {
                    name: "type",
                    label: "Type",
                    type: "String",
                    required: true,
                    attributes: {
                      options: getState().type_names.concat(fkey_opts || []),
                    },
                  },
                  {
                    name: "primary_key",
                    label: "Primary key",
                    type: "Bool",
                    //showIf: { type: pkey_options },
                  },
                ],
              }),
            ],
          });
          if (!ctx.fields || !ctx.fields.length) {
            if (!form.values) form.values = {};
            form.values.fields = pack.tables[0].fields;
          }

          return form;
        },
      },
    ],
  });

module.exports = {
  "PostgreSQL remote table": {
    configuration_workflow,
    fields: (cfg) => {
      return cfg?.fields || [];
    },
    get_table: (cfg) => {
      return {
        disableFiltering: true,
        deleteRows: async (where, user) => {
          const pool = await getConnection(cfg);
          return await deleteWhere(cfg.table_name, where, {
            schema: cfg.schema,
            client: pool,
          });
        },
        updateRow: async (update, version_id, user) => {
          //return await updateRow(cfg.table, update, version_id);
        },
        insertRow: async (rec, user) => {
          const table = Table.findOne({ name: cfg.table });
          //return await insertRow(table, rec);
        },
        countRows: async (where, opts) => {
          const pool = await getConnection(cfg);
          return await count(cfg.table, where || {}, {
            schema: cfg.schema,
            client: pool,
          });
        },
        distinctValues: async (fldNm, opts) => {
          //return await distinctValues(cfg.table, fldNm, opts);
        },
        getRows: async (where, opts) => {
          const pool = await getConnection(cfg);
          const qres = await select(cfg.table, where, {
            schema: cfg.schema,
            client: pool,
          });
          return qres;
        },
      };
    },
  },
};
