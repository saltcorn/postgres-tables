const db = require("@saltcorn/data/db");
const { eval_expression } = require("@saltcorn/data/models/expression");
const Workflow = require("@saltcorn/data/models/workflow");
const Form = require("@saltcorn/data/models/form");
const FieldRepeat = require("@saltcorn/data/models/fieldrepeat");
const Field = require("@saltcorn/data/models/field");
const Table = require("@saltcorn/data/models/table");
const { discover_tables } = require("@saltcorn/data/models/discovery");
const {
  aggregation_query_fields,
  joinfield_renamer,
} = require("@saltcorn/data/models/internal/query");
const { getState } = require("@saltcorn/data/db/state");
const { mkTable } = require("@saltcorn/markup");
const { pre, code } = require("@saltcorn/markup/tags");
const { getConnectObject } = require("@saltcorn/data/db/connect");
const { isNode } = require("@saltcorn/data/utils");

const { deleteWhere, count, select, insert, update } = isNode()
  ? require("@saltcorn/postgres/postgres")(getConnectObject)
  : {};
const {
  sqlsanitize,
  mkWhere,
  mkSelectOptions,
  orderByIsObject,
  orderByIsOperator,
} = require("@saltcorn/db-common/internal");

const { getConnection } = require("./connections");

const configuration_workflow = (req) =>
  new Workflow({
    onDone: (ctx) => {
      (ctx.fields || []).forEach((f) => {
        if (f.summary_field) {
          if (!f.attributes) f.attributes = {};
          f.attributes.summary_field = f.summary_field;
        }
      });
      return ctx;
    },
    steps: [
      {
        name: "table",
        form: async () => {
          return new Form({
            fields: [
              {
                name: "host",
                label: "Database host",
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
                sublabel:
                  "If blank, use environment variable <code>SC_EXTPG_PASS_{database name}</code>",
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

          const real_fkey_opts = tables.map((t) => `Key to ${t.name}`);
          const fkey_opts = ["File", ...real_fkey_opts];

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
                  {
                    name: "summary_field",
                    label: "Summary field",
                    sublabel:
                      "The field name, on the target table, which will be used to pick values for this key",
                    type: "String",
                    showIf: { type: real_fkey_opts },
                  },
                ],
              }),
            ],
          });
          if (!ctx.fields || !ctx.fields.length) {
            if (!form.values) form.values = {};
            form.values.fields = pack.tables[0].fields;
          } else {
            (ctx.fields || []).forEach((f) => {
              if (f.type === "Key" && f.reftable_name)
                f.type = `Key to ${f.reftable_name}`;
              if (f.attributes?.summary_field)
                f.summary_field = f.attributes?.summary_field;
              const reftable_name =
                f.reftable_name || typeof f.type === "string"
                  ? f.type.replace("Key to ", "")
                  : null;
              const reftable = reftable_name && Table.findOne(reftable_name);
              const repeater = form.fields.find((ff) => ff.isRepeat);
              const sum_form_field = repeater.fields.find(
                (ff) => ff.name === "summary_field"
              );
              if (reftable && sum_form_field) {
                sum_form_field.showIf.type = sum_form_field.showIf.type.filter(
                  (t) => t !== f.type
                );

                repeater.fields.push(
                  new Field({
                    name: "summary_field",
                    label: "Summary field for " + f.name,
                    sublabel: `The field name, on the ${reftable_name} table, which will be used to pick values for this key`,
                    type: "String",
                    showIf: { type: f.type },
                    attributes: {
                      options: reftable.fields.map((f) => f.name),
                    },
                  })
                );
              }
            });
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
            schema: cfg.schema || "public",
            client: pool,
          });
        },
        updateRow: async (updRow, id, user) => {
          const pool = await getConnection(cfg);
          return await update(cfg.table_name, updRow, id, {
            schema: cfg.schema || "public",
            client: pool,
          });
        },
        insertRow: async (rec, user) => {
          const pool = await getConnection(cfg);
          return await insert(cfg.table_name, rec, {
            schema: cfg.schema || "public",
            client: pool,
            noid: true,
          });
        },
        countRows: async (where, opts) => {
          const pool = await getConnection(cfg);
          return await count(cfg.table_name, where || {}, {
            schema: cfg.schema || "public",
            client: pool,
          });
        },
        aggregationQuery: async (aggregations, options) => {
          const pool = await getConnection(cfg);
          const { sql, values, groupBy } = aggregation_query_fields(
            cfg.table_name,
            aggregations,
            { ...options, schema: cfg.schema || "public" }
          );

          const res = await pool.query(sql, values);

          if (groupBy) return res.rows;
          return res.rows[0];
        },
        distinctValues: async (fieldnm, whereObj) => {
          const pool = await getConnection(cfg);
          if (whereObj) {
            const { where, values } = mkWhere(whereObj, db.isSQLite);
            const res = await pool.query(
              `select distinct "${db.sqlsanitize(
                fieldnm
              )}" from ${db.sqlsanitize(
                cfg.table_name
              )} ${where} order by "${db.sqlsanitize(fieldnm)}"`,
              values
            );
            return res.rows.map((r) => r[fieldnm]);
          } else {
            const res = await pool.query(
              `select distinct "${db.sqlsanitize(
                fieldnm
              )}" from ${db.sqlsanitize(
                cfg.table_name
              )} order by "${db.sqlsanitize(fieldnm)}"`
            );
            return res.rows.map((r) => r[fieldnm]);
          }
        },
        getRows: async (where, opts) => {
          const pool = await getConnection(cfg);
          const qres = await select(cfg.table_name, where, {
            ...opts,
            schema: cfg.schema || "public",
            client: pool,
          });
          return qres;
        },
        getJoinedRows: async (opts) => {
          const pool = await getConnection(cfg);
          const pseudoTable = new Table({
            name: cfg.table_name,
            fields: cfg.fields,
          });
          const { sql, values, joinFields, aggregations } =
            await pseudoTable.getJoinedQuery({
              schema: cfg.schema || "public",
              ...opts,
              ignoreExternal: true,
            });
          if (db.get_sql_logging?.()) console.log(sql, values);
          const res = await pool.query(sql, values);
          let rows = joinfield_renamer
            ? joinfield_renamer(joinFields, aggregations)(res.rows)
            : res.rows;
          for (const k of Object.keys(joinFields || {})) {
            if (!joinFields?.[k].lookupFunction) continue;
            for (const row of rows) {
              row[k] = await joinFields[k].lookupFunction(row);
            }
          }
          return rows;
        },
      };
    },
  },
};
