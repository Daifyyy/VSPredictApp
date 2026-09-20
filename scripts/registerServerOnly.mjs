// Trusted local Node maintenance commands only. Next's client-bundle guard has no
// purpose in a server-only CLI. Do not preload this hook in the application.
import { registerHooks } from "node:module";
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return {
      url: new URL("../node_modules/next/dist/compiled/server-only/empty.js", import.meta.url).href,
      shortCircuit: true,
    };
    return nextResolve(specifier, context);
  },
});
