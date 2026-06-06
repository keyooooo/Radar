/**
 * Radar (乐搭) Publish Page — create a new treehole post.
 */

import { useState } from 'react';
import { View, Text, Textarea, Input, Image } from '@tarojs/components';
import Taro from '@tarojs/taro';

import { createPost } from '../../services/posts';
import { getToken } from '../../services/api';

// ---------------------------------------------------------------------------
// Presets (same as homepage for consistency)
// ---------------------------------------------------------------------------

const INSTRUMENT_TAGS = ['鼓手', '吉他手', '贝斯手', '键盘手', '主唱', 'DJ', '制作人'];
const GENRE_TAGS = ['后摇', '独立摇滚', '金属', '朋克', '电子', '民谣', '爵士', '嘻哈'];
const CITY_OPTIONS = ['北京', '上海', '广州', '深圳', '成都', '杭州', '武汉', '南京', '其他'];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PublishPage() {
  const [category, setCategory] = useState<string>('band');
  const [content, setContent] = useState('');
  const [city, setCity] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // --- Tag toggle ---
  const toggleTag = (tag: string) => {
    setTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag],
    );
  };

  // --- City select ---
  const selectCity = (c: string) => {
    setCity(prev => (prev === c ? '' : c));
  };

  // --- Image picker (uses native fetch for H5 compatibility) ---
  const pickImages = async () => {
    try {
      const res = await Taro.chooseImage({
        count: 3 - images.length,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
      });
      if (res.tempFilePaths.length > 0) {
        setUploading(true);
        const uploadedUrls: string[] = [];
        for (const tempPath of res.tempFilePaths) {
          try {
            const token = getToken();
            const formData = new FormData();
            // Fetch the blob from tempPath for H5
            const blobRes = await fetch(tempPath);
            const blob = await blobRes.blob();
            formData.append('file', blob, `image_${Date.now()}.jpg`);

            const uploadRes = await fetch('http://127.0.0.1:8000/api/v1/utils/upload/', {
              method: 'POST',
              body: formData,
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (uploadRes.ok) {
              const data = await uploadRes.json() as { url: string };
              if (data.url) uploadedUrls.push(data.url);
            }
          } catch { /* skip failed upload */ }
        }
        if (uploadedUrls.length === 0) {
          Taro.showToast({ title: '图片上传失败', icon: 'none' });
        }
        setImages(prev => [...prev, ...uploadedUrls].slice(0, 3));
        setUploading(false);
      }
    } catch { /* user cancelled */ }
  };

  // --- Submit ---
  const handleSubmit = async () => {
    const trimmed = content.trim();
    if (!trimmed) {
      Taro.showToast({ title: '请输入内容', icon: 'none' });
      return;
    }
    if (!getToken()) {
      Taro.showToast({ title: '请先登录后再发帖', icon: 'none' });
      return;
    }

    setSubmitting(true);
    try {
      const res = await createPost({
        content: trimmed,
        category,
        city: city || undefined,
        tags: tags.length > 0 ? tags : undefined,
        images: images.length > 0 ? images : undefined,
      });

      if (res.ok) {
        Taro.showToast({ title: '发布成功！', icon: 'success' });
        // Clear form
        setContent('');
        setCity('');
        setTags([]);
        // Navigate back to feed
        setTimeout(() => Taro.navigateBack(), 800);
      } else {
        Taro.showToast({
          title: res.statusCode === 400 ? '内容包含敏感信息' : '发布失败，请重试',
          icon: 'none',
        });
      }
    } catch {
      Taro.showToast({ title: '网络错误，请重试', icon: 'none' });
    } finally {
      setSubmitting(false);
    }
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <View className="min-h-screen bg-gray-50 pb-20">
      {/* ---- Category selector ---- */}
      <View className="bg-white mx-3 mt-3 rounded-xl p-4 shadow-sm">
        <Text className="text-sm font-medium text-dark mb-2 block">分类</Text>
        <View className="flex bg-gray-100 rounded-lg p-0.5">
          {[
            { key: 'band', label: '🎸 组乐队' },
            { key: 'show', label: '🎫 看演出' },
          ].map(tab => (
            <View
              key={tab.key}
              className={`flex-1 py-2 rounded-md text-center text-sm font-medium
                ${category === tab.key ? 'bg-white text-primary shadow-sm' : 'text-muted'}`}
              onClick={() => setCategory(tab.key)}
            >
              {tab.label}
            </View>
          ))}
        </View>
      </View>

      {/* ---- Content textarea ---- */}
      <View className="bg-white mx-3 mt-3 rounded-xl p-4 shadow-sm">
        <Textarea
          className="w-full text-sm leading-relaxed text-dark"
          style={{ minHeight: '120px' }}
          placeholder="今晚哪有现场？捞个搭子..."
          placeholderStyle="color:#9ca3af;font-size:14px"
          maxlength={1000}
          value={content}
          onInput={e => setContent(e.detail.value)}
          autoHeight
          focus
        />
        <Text className="text-xs text-muted text-right block mt-1">
          {content.length}/1000
        </Text>
      </View>

      {/* ---- City selector ---- */}
      <View className="bg-white mx-3 mt-3 rounded-xl p-4 shadow-sm">
        <Text className="text-sm font-medium text-dark mb-2 block">📍 城市（可选）</Text>
        <View className="flex flex-wrap gap-1.5">
          {CITY_OPTIONS.map(c => (
            <View
              key={c}
              className={`px-3 py-1.5 rounded-full text-xs ${
                city === c
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-muted'
              }`}
              onClick={() => selectCity(c)}
            >
              {c}
            </View>
          ))}
        </View>
      </View>

      {/* ---- Tag selector ---- */}
      <View className="bg-white mx-3 mt-3 rounded-xl p-4 shadow-sm">
        <Text className="text-sm font-medium text-dark mb-2 block">🏷 标签（可选）</Text>

        <Text className="text-xs text-muted mb-1.5 block">乐器 / 角色</Text>
        <View className="flex flex-wrap gap-1 mb-3">
          {INSTRUMENT_TAGS.map(t => (
            <View
              key={t}
              className={`px-2.5 py-1 rounded-full text-xs ${
                tags.includes(t)
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-muted'
              }`}
              onClick={() => toggleTag(t)}
            >
              {t}
            </View>
          ))}
        </View>

        <Text className="text-xs text-muted mb-1.5 block">音乐风格</Text>
        <View className="flex flex-wrap gap-1">
          {GENRE_TAGS.map(t => (
            <View
              key={t}
              className={`px-2.5 py-1 rounded-full text-xs ${
                tags.includes(t)
                  ? 'bg-secondary text-white'
                  : 'bg-gray-100 text-muted'
              }`}
              onClick={() => toggleTag(t)}
            >
              {t}
            </View>
          ))}
        </View>

        {/* Selected tags summary */}
        {tags.length > 0 && (
          <View className="mt-3 pt-3 border-t border-gray-100">
            <Text className="text-xs text-muted">
              已选: {tags.join(' · ')}
            </Text>
          </View>
        )}
      </View>

      {/* ---- Image picker ---- */}
      <View className="bg-white mx-3 mt-3 rounded-xl p-4 shadow-sm">
        <Text className="text-sm font-medium text-dark mb-2 block">📷 图片（最多3张）</Text>
        <View className="flex flex-wrap gap-2">
          {images.map((url, i) => {
            if (!url) return null;
            const fullUrl = url.startsWith('/') ? `http://127.0.0.1:8000${url}` : url;
            return (
              <View key={i} className="relative w-20 h-20 rounded-lg bg-gray-100 overflow-hidden">
                <Image src={fullUrl} className="w-full h-full" mode="aspectFill" />
                <View className="absolute top-0 right-0 w-5 h-5 bg-black/50 rounded-bl-lg flex items-center justify-center"
                  onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}>
                  <Text className="text-white text-xs">✕</Text>
                </View>
              </View>
            );
          })}
          {images.length < 3 && (
            <View className="w-20 h-20 rounded-lg bg-gray-100 flex items-center justify-center border border-dashed border-gray-300"
              onClick={pickImages}>
              <Text className="text-2xl text-muted">{uploading ? '...' : '+'}</Text>
            </View>
          )}
        </View>
      </View>

      {/* ---- Submit button ---- */}
      <View className="mx-3 mt-6">
        <View
          className={`w-full py-3.5 rounded-xl text-center text-white font-medium text-base
            ${submitting || !content.trim()
              ? 'bg-gray-300'
              : 'bg-primary active:scale-[0.98]'
            }`}
          onClick={submitting ? undefined : handleSubmit}
        >
          {submitting ? '发布中...' : '🚀 发布'}
        </View>
      </View>
    </View>
  );
}
