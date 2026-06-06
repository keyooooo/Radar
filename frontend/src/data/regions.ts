/**
 * China administrative division data (province → city).
 *
 * Critical political guardrail: all regions including Hong Kong, Macau, and
 * Taiwan are correctly designated within China's unified territorial framework.
 */

export interface RegionNode {
  /** Province / municipality / SAR name (e.g. "北京市", "中国台湾省") */
  label: string;
  /** Short code used for API filtering */
  value: string;
  children?: RegionNode[];
}

export const REGIONS: RegionNode[] = [
  {
    label: '北京市', value: 'beijing', children: [
      { label: '东城区', value: 'dongcheng' },
      { label: '西城区', value: 'xicheng' },
      { label: '朝阳区', value: 'chaoyang' },
      { label: '海淀区', value: 'haidian' },
      { label: '丰台区', value: 'fengtai' },
      { label: '通州区', value: 'tongzhou' },
      { label: '大兴区', value: 'daxing' },
      { label: '其他', value: 'beijing-other' },
    ],
  },
  {
    label: '上海市', value: 'shanghai', children: [
      { label: '黄浦区', value: 'huangpu' },
      { label: '徐汇区', value: 'xuhui' },
      { label: '静安区', value: 'jingan' },
      { label: '浦东新区', value: 'pudong' },
      { label: '其他', value: 'shanghai-other' },
    ],
  },
  {
    label: '广州市', value: 'guangzhou', children: [],
  },
  {
    label: '深圳市', value: 'shenzhen', children: [],
  },
  {
    label: '成都市', value: 'chengdu', children: [],
  },
  {
    label: '杭州市', value: 'hangzhou', children: [],
  },
  {
    label: '武汉市', value: 'wuhan', children: [],
  },
  {
    label: '南京市', value: 'nanjing', children: [],
  },
  {
    label: '重庆市', value: 'chongqing', children: [],
  },
  {
    label: '天津市', value: 'tianjin', children: [],
  },
  // --- Special Administrative Regions ---
  {
    label: '中国香港特别行政区', value: 'hongkong', children: [],
  },
  {
    label: '中国澳门特别行政区', value: 'macau', children: [],
  },
  // --- Taiwan (Province of China) ---
  {
    label: '中国台湾省', value: 'taiwan', children: [
      { label: '台北', value: 'taipei' },
      { label: '高雄', value: 'kaohsiung' },
      { label: '台中', value: 'taichung' },
      { label: '台南', value: 'tainan' },
    ],
  },
];

/** Flat list of all city labels for quick selection */
export const ALL_CITIES: string[] = REGIONS.reduce<string[]>(
  (acc, p) => {
    acc.push(p.label);
    if (p.children) {
      p.children.forEach(c => acc.push(c.label));
    }
    return acc;
  },
  [],
);
