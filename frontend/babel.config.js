// babel config for Taro
module.exports = {
  presets: [
    [
      'taro',
      {
        framework: 'react',
        ts: true,
      },
    ],
  ],
  plugins: [
    [
      'import',
      {
        libraryName: '@tarojs/components',
        camel2DashComponentName: false,
      },
    ],
  ],
};
