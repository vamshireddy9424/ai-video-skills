// Preview an episode in a browser: node scripts/serve.mjs, then open the printed URL and click.
import { serve, arg } from "./lib.mjs";

const server = await serve(Number(arg("port", 5178)));
const { port } = server.address();
console.log(`http://localhost:${port}/web/?ep=${arg("ep", "tatkal")}`);
