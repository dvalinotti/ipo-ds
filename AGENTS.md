# iPoDS

- Framework code belongs in the PocketJS repository; update the `runtime` submodule pin here.
- Import framework APIs from `@pocketjs/framework/*` and Solid primitives and control flow from `solid-js`.
- The 3DS host drives both screens: `pocket.json` declares the 400x240 top viewport and the 320x240 `surfaces.auxiliary` together with `display.auxiliary`.
- Name commits and pull requests in Conventional Commits format (`feat: …`, `fix(scope): …`).
- Do not recursively discover tests or sources through the runtime submodule.
- Keep build products, logs and captures out of Git.
