const { Pool } = require("pg");

const pools = {};

const getConnection = async (connStr) => {
  if (!connStr) return null;
  const connectionString =
    typeof connStr === "object" ? getConnStr(connStr) : connStr;
  if (!pools[connectionString]) {
    const poolOpt = { connectionString: connectionString.split("###SSL//")[0] };
    if (connStr.ssl) {
      poolOpt.ssl = {
        ca: connStr.ca || undefined,
        key: connStr.key || undefined,
        cert: connStr.cert || undefined,
      };
    }
    pools[connectionString] = new Pool(poolOpt);
  }
  return pools[connectionString];
};

const getConnStr = ({
  host,
  user,
  password,
  port,
  database,
  ssl,
  ca,
  key,
  cert,
}) => {
  const sslsuffix = !ssl ? "" : `###SSL//${ca}//${key}//${cert}`;
  if (!password)
    return `postgresql://${user}:${
      process.env[`SC_EXTPG_PASS_${database}`]
    }@${host}:${port}/${database}${sslsuffix}`;
  else
    return `postgresql://${user}:${password}@${host}:${port}/${database}${sslsuffix}`;
};

module.exports = { getConnection };
