import type { UserConfigExport } from '@tarojs/cli';

const devConfig: UserConfigExport = {
  env: {
    NODE_ENV: '"development"',
  },
  logger: {
    quiet: false,
    stats: true,
  },
  mini: {},
  h5: {},
};

export default devConfig;
