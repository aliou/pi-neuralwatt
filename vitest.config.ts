import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // direnv's `use flake` copies flake inputs into .direnv/ inside the repo;
    // those snapshots contain foreign test files that must not run here.
    exclude: [...configDefaults.exclude, ".direnv/**"],
  },
});
