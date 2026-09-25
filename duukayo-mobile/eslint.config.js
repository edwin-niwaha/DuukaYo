const {defineConfig}=require('eslint/config');
const expo=require('eslint-config-expo/flat');
module.exports=defineConfig([expo,{ignores:['.expo/**','tests/**','dist-check/**']},{rules:{'react-hooks/set-state-in-effect':'off'}}]);
