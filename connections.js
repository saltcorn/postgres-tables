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

const getConnStr = ({ host, user, password, port, database }) =>
  `postgresql://${user}:${password}@${host}:${port}/${database}`;

module.exports = { getConnection };
