module.exports = {
  sc_plugin_api_version: 1,
  table_providers: require("./table-provider.js"),
  viewtemplates: [require("./database-browser")],
  ready_for_mobile: true,
};
