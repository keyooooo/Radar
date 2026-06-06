/// <reference types="@tarojs/taro" />

declare module '*.png';
declare module '*.gif';
declare module '*.jpg';
declare module '*.jpeg';
declare module '*.svg';
declare module '*.css';
declare module '*.less';
declare module '*.scss';
declare module '*.sass';
declare module '*.styl';

declare namespace NodeJS {
  interface ProcessEnv {
    /** NODE_ENV */
    NODE_ENV: 'development' | 'production';
  }
}

// Taro global type declarations
declare function defineAppConfig(config: Record<string, unknown>): Record<string, unknown>;
declare function definePageConfig(config: Record<string, unknown>): Record<string, unknown>;
