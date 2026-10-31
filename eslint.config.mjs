import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Módulos de plataforma: los únicos que pueden usar el cliente de Prisma sin
 * alcance. Todo lo demás trabaja con el cliente limitado a una arrendadora
 * (src/lib/db/scoped.ts). Si hace falta agregar uno, que sea a propósito.
 */
const PLATFORM_MODULES = [
  "src/lib/prisma.ts",
  "src/lib/db/**",
  "src/lib/auth/**",
  "src/lib/org.ts",
  "src/app/login/**",
  "src/server/auth/**",
  "src/server/superadmin/**",
  "src/test/**",
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: PLATFORM_MODULES,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/prisma",
              message:
                "Usa el cliente con alcance (requireOrgUser / requireOrgUserAction → db). Ver src/lib/db/scoped.ts.",
            },
          ],
          patterns: [
            {
              group: ["**/lib/prisma"],
              message:
                "Usa el cliente con alcance (requireOrgUser / requireOrgUserAction → db). Ver src/lib/db/scoped.ts.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Código generado por Prisma.
    "src/generated/**",
  ]),
]);

export default eslintConfig;
