import { discover } from "../src/core/discover.js";
import { endpoints } from "../src/registry.js";

const [command, ...rest] = process.argv.slice(2);

if (command === "inspect") {
  const id = rest[0];
  const endpoint = endpoints.find((item) => item.id === id);
  if (!endpoint) {
    console.error(`Unknown id ${id ?? ""}`);
    process.exit(1);
  }
  console.log(
    JSON.stringify(
      {
        id: endpoint.id,
        summary: endpoint.meta.summary,
        tags: endpoint.meta.tags,
        docsUrl: endpoint.meta.docsUrl,
      },
      null,
      2,
    ),
  );
} else if (command === "search") {
  console.log(JSON.stringify(discover(endpoints, rest.join(" "), 10), null, 2));
} else {
  for (const endpoint of endpoints) {
    console.log(`${endpoint.id}\t${endpoint.meta.summary}`);
  }
}
