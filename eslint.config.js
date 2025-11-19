import js from "@eslint/js";

export default [
  {
    ignores: ["coverage/**", "node_modules/**"]
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        // Browser globals
        console: "readonly",
        document: "readonly",
        window: "readonly",
        navigator: "readonly",
        localStorage: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearTimeout: "readonly",
        clearInterval: "readonly",
        fetch: "readonly",
        URL: "readonly",
        Blob: "readonly",
        FileReader: "readonly",
        confirm: "readonly",
        history: "readonly",
        URLSearchParams: "readonly",
        CustomEvent: "readonly",
        crypto: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        requestAnimationFrame: "readonly",
        SVGElement: "readonly",
        AbortSignal: "readonly",
        AbortController: "readonly",
        Event: "readonly",
        KeyboardEvent: "readonly",

        // Web Extensions
        chrome: "readonly",

        // Jest globals
        describe: "readonly",
        test: "readonly",
        it: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        jest: "readonly",

        // Node.js globals (for scripts)
        process: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        module: "readonly",
        require: "readonly",
        exports: "readonly",

        // Test globals
        global: "writable"
      }
    },
    rules: {
      "no-unused-vars": ["warn", {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_",
        "caughtErrorsIgnorePattern": "^_"
      }],
      "no-console": "off"
    }
  }
];
