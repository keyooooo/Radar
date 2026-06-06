/**
 * Post-install patch for @tarojs/components@4.x on Node.js v24+.
 *
 * Taro's webpack5-runner resolves component imports as individual files
 * (e.g. @tarojs/components/lib/View) for tree-shaking, but the v4
 * components package ships a single bundled modules. This script
 * creates lightweight re-export shims so the resolution succeeds.
 */

const fs = require('fs');
const path = require('path');

const COMPONENTS_DIR = path.resolve(
  __dirname,
  '..',
  'node_modules',
  '@tarojs',
  'components',
  'lib',
);

// All Taro built-in components that the NormalModulesPlugin may try to resolve
const COMPONENT_NAMES = [
  'View', 'Text', 'Image', 'Button', 'Input', 'Textarea', 'ScrollView',
  'Swiper', 'SwiperItem', 'MovableView', 'MovableArea', 'Icon',
  'Checkbox', 'CheckboxGroup', 'Picker', 'PickerView', 'PickerViewColumn',
  'Radio', 'RadioGroup', 'Slider', 'Switch', 'Label', 'Form',
  'Navigator', 'RichText', 'Progress', 'Canvas', 'Map', 'WebView',
  'Block', 'CoverView', 'CoverImage', 'Audio', 'Video', 'Camera',
  'LivePlayer', 'LivePusher', 'OpenData', 'Ad', 'FunctionalPageNavigator',
  'NavigationBar', 'PageMeta',
];

if (!fs.existsSync(COMPONENTS_DIR)) {
  console.warn('[patch-taro] @tarojs/components/lib not found — skipping');
  process.exit(0);
}

let created = 0;
let skipped = 0;

for (const name of COMPONENT_NAMES) {
  const shimPath = path.join(COMPONENTS_DIR, name + '.js');
  if (!fs.existsSync(shimPath)) {
    fs.writeFileSync(
      shimPath,
      `module.exports = require("./react/components").${name};\n`,
    );
    created++;
  } else {
    skipped++;
  }
}

console.log(
  `[patch-taro] Component shims: ${created} created, ${skipped} already exist`,
);
