import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Upstream React Bits components (see their headers). Their ref and effect
  // patterns trip React Compiler rules; the compiler isn't enabled, and
  // rewriting them would risk their established animation behavior.
  {
    files: [
      "components/DriftWall.jsx",
      "components/OptionWheel.jsx",
      "components/PillNav.jsx",
    ],
    rules: {
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // eve's local dev server state and build output (agent/).
    ".eve/**",
    ".output/**",
  ]),
]);

export default eslintConfig;
