import eslint from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import typescript from "typescript-eslint";

export default defineConfig([
  globalIgnores([".next/**", "out/**", "dist/**", "**/target/**", "pip-seed/tauri/gen/**"]),
  eslint.configs.recommended,
  ...typescript.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      "no-control-regex": "off",
      "no-useless-escape": "off",
    },
  },
]);
