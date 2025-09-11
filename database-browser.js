const Field = require("@saltcorn/data/models/field");
const Table = require("@saltcorn/data/models/table");
const Form = require("@saltcorn/data/models/form");
const View = require("@saltcorn/data/models/view");
const db = require("@saltcorn/data/db");
const Workflow = require("@saltcorn/data/models/workflow");
const { renderForm } = require("@saltcorn/markup");
const {
  discover_tables,
  discoverable_tables,
} = require("@saltcorn/data/models/discovery");

const { div, script, domReady, pre, code } = require("@saltcorn/markup/tags");
const { getState } = require("@saltcorn/data/db/state");
const { getConnection } = require("./connections");

const configuration_workflow = () =>
  new Workflow({
    steps: [],
  });
const getForm = async ({ viewname, body }) => {
  const tables = await Table.find({});
  const fields = [
    {
      name: "host",
      label: "Database host",
      type: "String",
      required: true,
      attributes: { asideNext: true },
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
      attributes: { asideNext: true },
    },
    {
      name: "password",
      label: "Password",
      type: "String",
      fieldview: "password",
      sublabel:
        "If blank, use environment variable <code>SC_EXTPG_PASS_{database name}</code>",
      required: true,
    },
    {
      name: "database",
      label: "Database",
      type: "String",
      required: true,
      attributes: { asideNext: true },
    },
    {
      name: "schema",
      label: "Schema",
      type: "String",
    },
    {
      name: "tables",
      label: "Tables",
      type: "String",
      class: "table-selector",
      attributes: { options: [] },
    },
  ];

  const form = new Form({
    action: `/view/${viewname}`,
    fields,
    //onChange: "$(this).submit()",
    noSubmitButton: true,
    additionalButtons: [
      {
        label: "Look up tables",
        onclick: "look_up_tables(this)",
        class: "btn btn-primary",
      },
      {
        label: "Import tables",
        onclick: "import_tables(this)",
        class: "btn btn-primary",
      },
    ],
  });
  return form;
};

const js = (viewname) =>
  script(`
function look_up_tables(that) {
  const form = $(that).closest('form'); 
  view_post("${viewname}", "lookup_tables", $(form).serialize(), (r)=>{
    $(".table-selector").attr("multiple", true).html(r.tables.map(t=>'<option>'+t+'</option>').join(""))

  })
}
function import_tables(that) {
  const form = $(that).closest('form'); 
  view_post("${viewname}", "import_tables", $(form).serialize())
}
`);
const run = async (table_id, viewname, cfg, state, { res, req }) => {
  const form = await getForm({ viewname });
  return renderForm(form, req.csrfToken()) + js(viewname);
};
const runPost = async (
  table_id,
  viewname,
  config,
  state,
  body,
  { req, res }
) => {
  const form = await getForm({ viewname, body });
  form.validate(body);
  let plot = "";
  if (!form.hasErrors) {
    const table = await Table.findOne({ name: form.values.table });
  }
  form.hasErrors = false;
  form.errors = {};
  res.sendWrap("Data explorer", [
    renderForm(form, req.csrfToken()),
    js(viewname),
    plot,
  ]);
};

const lookup_tables = async (table_id, viewname, config, body, { req }) => {
  const form = await getForm({ viewname, body });
  form.validate(body);
  if (!form.hasErrors) {
    const cfg = form.values;
    const pool = await getConnection(cfg);
    const tbls = await discoverable_tables(cfg.schema || "public", true, pool);

    return { json: { success: "ok", tables: tbls.map((t) => t.table_name) } };
  }
  return { json: { error: "Form incomplete" } };
};

const import_tables = async (table_id, viewname, config, body, { req }) => {
  const form = await getForm({ viewname, body });
  form.validate(body);
  if (!form.hasErrors) {
    const { _csrf, tables, ...cfg } = form.values;

    const pool = await getConnection(cfg);
    //const tbls = await discoverable_tables(cfg.schema, true, pool);
    const pack = await discover_tables(
      Array.isArray(body.tables) ? body.tables : [body.tables],
      cfg.schema || "public",
      pool
    );
    const imported = [],
      updated = [],
      skipped = [];
    for (const tableCfg of pack.tables) {
      const existing = Table.findOne({ name: tableCfg.name });
      if (existing?.provider_name === "PostgreSQL remote table") {
        updated.push(tableCfg.name);
        await existing.update({
          provider_cfg: {
            ...cfg,
            table_name: tableCfg.name,
            fields: tableCfg.fields,
          },
        });
      } else if (existing) {
        skipped.push(tableCfg.name);
      } else {
        imported.push(tableCfg.name);
        await Table.create(tableCfg.name, {
          provider_name: "PostgreSQL remote table",
          provider_cfg: {
            ...cfg,
            table_name: tableCfg.name,
            fields: tableCfg.fields,
          },
        });
      }
    }
    return {
      json: {
        success: "ok",
        notify: `${
          imported.length ? `Imported tables: ${imported.join(",")}. ` : ""
        }${updated.length ? `Updated tables: ${updated.join(",")}. ` : ""}${
          skipped.length
            ? `Skipped tables (name clash): ${skipped.join(",")}. `
            : ""
        }`,
      },
    };
  }
  return { json: { error: "Form incomplete" } };
};

module.exports = {
  name: "PostgreSQL Database Explorer",
  display_state_form: false,
  tableless: true,
  singleton: true,
  description: "Explore and import PostgreSQL databases",
  get_state_fields: () => [],
  configuration_workflow,
  run,
  runPost,
  routes: { lookup_tables, import_tables },
};
