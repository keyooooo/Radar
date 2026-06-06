import type { UserConfigExport } from '@tarojs/cli';

const prodConfig: UserConfigExport = {
  env: {
    NODE_ENV: '"production"',
  },
  logger: {
    quiet: true,
    stats: false,
  },
  mini: {
    // Production mini-program optimizations
    compile: {
      exclude: [],
    },
  },
  h5: {
    publicPath: '/',
  },
};

export default prodConfig;
