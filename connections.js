const { Pool } = require("pg");

const pools = {};

const getConnection = async (connStr) => {
  if (!connStr) return null;
  const connectionString =
    typeof connStr === "object" ? getConnStr(connStr) : connStr;
  if (!pools[connectionString])
    pools[connectionString] = new Pool({ connectionString });
  return pools[connectionString];
};

const getConnStr = ({ host, user, password, port, database }) => {
  if (!password)
    return `postgresql://${user}:${
      process.env[`SC_EXTPG_PASS_${database}`]
    }@${host}:${port}/${database}`;
  else return `postgresql://${user}:${password}@${host}:${port}/${database}`;
};

module.exports = { getConnection };
