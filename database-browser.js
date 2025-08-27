const Field = require("@saltcorn/data/models/field");
const Table = require("@saltcorn/data/models/table");
const Form = require("@saltcorn/data/models/form");
const View = require("@saltcorn/data/models/view");
const db = require("@saltcorn/data/db");
const Workflow = require("@saltcorn/data/models/workflow");
const { renderForm } = require("@saltcorn/markup");


const { div, script, domReady, pre, code } = require("@saltcorn/markup/tags");
const { getState } = require("@saltcorn/data/db/state");

const configuration_workflow = () =>
  new Workflow({
    steps: [],
  });
const getForm = async ({ viewname, body }) => {
  const tables = await Table.find({});
  const fields = [
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
  ];

  const form = new Form({
    action: `/view/${viewname}`,
    fields,
    //onChange: "$(this).submit()",
    noSubmitButton: true,
    additionalButtons: [
      {
        label: "Import tables",
        onclick: "save_as_view(this)",
        class: "btn btn-primary",
      },
    ],
  });
  return form;
};

const js = (viewname) =>
  script(`
function save_as_view(that) {
  const form = $(that).closest('form');
  const newviewname = prompt("Please enter the name of the view to be saved", "");
  if(!newviewname) return;
  $('input[name=newviewname]').val(newviewname)
  view_post("${viewname}", "save_as_view", $(form).serialize())
}
`);
const run = async (table_id, viewname, cfg, state, { res, req }) => {
  const form = await getForm({ viewname });
  return renderForm(form, req.csrfToken());
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

const save_as_view = async (table_id, viewname, config, body, { req }) => {
  const form = await getForm({ viewname, body });
  form.validate(body);
  if (!form.hasErrors) {
    const { _csrf, table, plottype, newviewname, ...configuration } =
      form.values;
    const existing = await View.findOne({ name: newviewname });
    if (existing) {
      return { json: { error: "A view with that name already exists" } };
    }
    const tbl = await Table.findOne({ name: table });
    const viewtemplate = plottype + "Vis";
    await View.create({
      table_id: tbl.id,
      configuration,
      name: newviewname,
      viewtemplate,
      min_role: 1,
    });
    await getState().refresh_views();
    return { json: { success: "ok", notify: `View ${newviewname} created` } };
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
  routes: { save_as_view },
};
