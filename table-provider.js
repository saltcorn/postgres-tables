const { eval_expression } = require("@saltcorn/data/models/expression");
const Workflow = require("@saltcorn/data/models/workflow");
const Form = require("@saltcorn/data/models/form");
const FieldRepeat = require("@saltcorn/data/models/fieldrepeat");
const Field = require("@saltcorn/data/models/field");
const Table = require("@saltcorn/data/models/table");
const { getState } = require("@saltcorn/data/db/state");
const { mkTable } = require("@saltcorn/markup");
const { pre, code } = require("@saltcorn/markup/tags");
const {
  runQuery,
  countRows,
  deleteRows,
  updateRow,
  insertRow,
  distinctValues,
} = require("./common");
const { Pool } = require("pg");

const pools = {};

const getConnection = async (connStr) => {
  if (!pools[connStr]) pools[connStr] = new Pool(connStr);
  return pools[connStr];
};

const getConnStr = ({ host, user, password, port, database }) =>
  `postgresql://${user}:${password}@${host}:${port}/${database}`;

const configuration_workflow = (req) =>
  new Workflow({
    steps: [
      {
        name: "query",
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
    ],
  });

module.exports = {
  "PostgreSQL remote table": {
    configuration_workflow,
    fields: (cfg) => {
      if (!cfg?.table) return [];

      const table = Table.findOne({ name: cfg.table });
      return [
        {
          name: "_version_id",
          type: "String",
          primary_key: true,
          is_unique: true,
        },
        ...table.fields.map((f) => {
          f.primary_key = false;
          f.validator = undefined;
          if (f.is_fkey) f.type = "Integer";
          else f.type = f.type?.name || f.type;
          return f;
        }),
        { name: "_version", label: "Version", type: "Integer" },
        { name: "_is_latest", label: "Is latest", type: "Bool" },
        { name: "_deleted", label: "Deleted", type: "Bool" },
        { name: "_time", label: "Time", type: "Date" },
        { name: "_userid", label: "User ID", type: "Integer" },
        {
          name: "_restore_of_version",
          label: "Restore of version",
          type: "Integer",
        },
      ];
    },
    get_table: (cfg) => {
      return {
        disableFiltering: true,
        deleteRows: async (where, user) => {
          return await deleteRows(cfg.table, where, user);
        },
        updateRow: async (update, version_id, user) => {
          return await updateRow(cfg.table, update, version_id);
        },
        insertRow: async (rec, user) => {
          const table = Table.findOne({ name: cfg.table });
          return await insertRow(table, rec);
        },
        countRows: async (where, opts) => {
          return await countRows(cfg.table, where || {});
        },
        distinctValues: async (fldNm, opts) => {
          return await distinctValues(cfg.table, fldNm, opts);
        },
        getRows: async (where, opts) => {
          const table = Table.findOne({ name: cfg.table });
          const qres = await runQuery(table, where, opts);
          return qres.rows;
        },
      };
    },
  },
};
