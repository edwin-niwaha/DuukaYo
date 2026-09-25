// Load the real shared feedback hook in the isolated screen test harnesses.
const fs = require("node:fs"), vm = require("node:vm"), ts = require("typescript");
const result = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve("../src/lib/feedback.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: result, require });
module.exports = result;
