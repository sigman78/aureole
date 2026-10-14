import { defineConfig } from 'vite';

export default defineConfig({
  server:{watch:{ignored:['**/artifacts/**','**/.cache/**']}},
  build:{rolldownOptions:{output:{codeSplitting:{groups:[{name:'three',test:/node_modules\/three/}]}}}}
});
