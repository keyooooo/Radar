import type { UserConfigExport } from '@tarojs/cli';

const config: UserConfigExport = {
  projectName: 'radar-frontend',
  date: '2026-6-6',
  designWidth: 375,
  deviceRatio: {
    375: 2,
    640: 2.34 / 2,
    750: 1,
    828: 1.81 / 2,
  },
  sourceRoot: 'src',
  outputRoot: 'dist',
  plugins: [
    '@tarojs/plugin-framework-react',
  ],
  defineConstants: {},
  copy: {
    patterns: [],
    options: {},
  },
  framework: 'react',
  compiler: {
    type: 'webpack5',
  },
  cache: {
    enable: false,
  },
  mini: {
    postcss: {
      pxtransform: {
        enable: true,
        config: {},
      },
      cssModules: {
        enable: false,
        config: {
          namingPattern: 'module',
          generateScopedName: '[name]__[local]___[hash:base64:5]',
        },
      },
    },
    webpackChain(chain) {
      // Inject weapp-tailwindcss for WeChat Mini-Program
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      chain.plugin('weappTailwindcss').use(
        require('weapp-tailwindcss/webpack').WeappTailwindcss,
        [
          {
            appType: 'taro',
            rem2rpx: true,
          },
        ],
      );
    },
  },
  h5: {
    publicPath: './',
    staticDirectory: 'static',
    output: {
      filename: 'js/[name].[hash:8].js',
      chunkFilename: 'js/[name].[chunkhash:8].js',
    },
    miniCssExtractPluginOption: {
      ignoreOrder: true,
      filename: 'css/[name].[hash].css',
      chunkFilename: 'css/[name].[chunkhash].css',
    },
    postcss: {
      autoprefixer: {
        enable: true,
        config: {},
      },
      cssModules: {
        enable: false,
        config: {
          namingPattern: 'module',
          generateScopedName: '[name]__[local]___[hash:base64:5]',
        },
      },
    },
    webpackChain(_chain) {
      // H5 uses standard Tailwind via postcss.config.js — no
      // weapp-tailwindcss needed (it's only for mini-program class transforms).
    },
  },
  rn: {
    appName: 'taroDemo',
    postcss: {
      cssModules: {
        enable: false,
      },
    },
  },
};

export default config;
