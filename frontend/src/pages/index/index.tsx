/**
 * Radar (乐搭) Homepage — treehole post feed with infinite scroll,
 * multi-dimensional filtering, and Redis-backed like toggle.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, View, Text, Input, Image } from '@tarojs/components';
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro';

import { fetchPosts, toggleLike, type PostPublic } from '../../services/posts';
import { getToken, isLoggedIn } from '../../services/api';

// ---------------------------------------------------------------------------
// Preset tag / city options (will eventually come from the backend)
// ---------------------------------------------------------------------------

const INSTRUMENT_TAGS = ['鼓手', '吉他手', '贝斯手', '键盘手', '主唱', 'DJ', '制作人'];
const GENRE_TAGS = ['后摇', '独立摇滚', '金属', '朋克', '电子', '民谣', '爵士', '嘻哈'];
const CITY_OPTIONS = ['北京', '上海', '广州', '深圳', '成都', '杭州', '武汉', '南京'];

const ALL_TAGS = [...INSTRUMENT_TAGS, ...GENRE_TAGS];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function IndexPage() {
  // --- Feed state ---
  const [posts, setPosts] = useState<PostPublic[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // --- Category tab ---
  const [activeCategory, setActiveCategory] = useState<string>(''); // '' = all, 'band', 'show'

  // --- Filter state ---
  const [filterCity, setFilterCity] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [keyword, setKeyword] = useState('');
  const [showTagPicker, setShowTagPicker] = useState(false);

  // --- Auth ---
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Refs for stable callbacks
  const cursorRef = useRef<string | null>(null);
  const tagsRef = useRef<string[]>([]);
  const cityRef = useRef('');
  const kwRef = useRef('');

  // Sync refs
  useEffect(() => { cursorRef.current = nextCursor; }, [nextCursor]);
  useEffect(() => { tagsRef.current = selectedTags; }, [selectedTags]);
  useEffect(() => { cityRef.current = filterCity; }, [filterCity]);
  useEffect(() => { kwRef.current = keyword; }, [keyword]);

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  /** Load first page (reset). */
  const loadFeed = useCallback(async (isRefresh = false) => {
    if (loading) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await fetchPosts({
        size: 10,
        category: activeCategory || undefined,
        city: cityRef.current || undefined,
        tags: tagsRef.current.join(',') || undefined,
        keyword: kwRef.current || undefined,
      });
      if (res.ok) {
        setPosts(res.data.data);
        setNextCursor(res.data.next_cursor);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      Taro.stopPullDownRefresh();
    }
  }, [loading]);

  /** Load next page (append). */
  const loadMore = useCallback(async () => {
    if (loadingMore || !cursorRef.current) return;
    setLoadingMore(true);
    try {
      const res = await fetchPosts({
        cursor: cursorRef.current,
        size: 10,
        category: activeCategory || undefined,
        city: cityRef.current || undefined,
        tags: tagsRef.current.join(',') || undefined,
        keyword: kwRef.current || undefined,
      });
      if (res.ok) {
        setPosts(prev => [...prev, ...res.data.data]);
        setNextCursor(res.data.next_cursor);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore]);

  // Initial load + onShow refresh
  useDidShow(() => {
    setAuthToken(getToken());
    loadFeed();
  });

  // Pull-to-refresh
  usePullDownRefresh(() => {
    loadFeed(true);
  });

  // -----------------------------------------------------------------------
  // Filter actions
  // -----------------------------------------------------------------------

  const applyFilters = () => {
    setShowTagPicker(false);
    loadFeed();
  };

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag],
    );
  };

  const clearFilters = () => {
    setFilterCity('');
    setSelectedTags([]);
    setKeyword('');
    // Reload immediately with cleared filters
    setTimeout(() => loadFeed(), 0);
  };

  const hasActiveFilters = filterCity || selectedTags.length > 0 || keyword;

  // -----------------------------------------------------------------------
  // Like toggle (optimistic update)
  // -----------------------------------------------------------------------

  const handleLike = useCallback(async (postId: string, idx: number) => {
    // Read token directly from storage each time — avoids needing a refresh
    // after the user injects the token via browser console.
    if (!getToken()) {
      Taro.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    const post = posts[idx];
    const wasLiked = post.is_liked_by_me;

    // Optimistic update
    setPosts(prev => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        is_liked_by_me: !wasLiked,
        like_count: wasLiked
          ? Math.max(0, next[idx].like_count - 1)
          : next[idx].like_count + 1,
      };
      return next;
    });

    try {
      const res = await toggleLike(postId);
      if (!res.ok && res.statusCode === 401) {
        // Revert on auth failure
        setPosts(prev => {
          const next = [...prev];
          next[idx] = { ...next[idx], is_liked_by_me: wasLiked, like_count: post.like_count };
          return next;
        });
      }
    } catch {
      // Revert on network error
      setPosts(prev => {
        const next = [...prev];
        next[idx] = { ...next[idx], is_liked_by_me: wasLiked, like_count: post.like_count };
        return next;
      });
    }
  }, [posts]);

  // -----------------------------------------------------------------------
  // Render helpers
  // -----------------------------------------------------------------------

  const formatTime = (iso: string | null) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      const now = new Date();
      const diff = now.getTime() - d.getTime();
      if (diff < 60_000) return '刚刚';
      if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
      if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
      return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  const TagChip = ({ tag }: { tag: string }) => (
    <Text className="inline-block bg-indigo-50 text-primary text-xs px-2 py-0.5 rounded-full mr-1 mb-1">
      {tag}
    </Text>
  );

  // -----------------------------------------------------------------------
  // JSX
  // -----------------------------------------------------------------------

  return (
    <View className="min-h-screen bg-gray-50 flex flex-col">
      {/* ---- Header ---- */}
      <View className="bg-white px-4 pt-4 pb-3 shadow-sm sticky top-0 z-10">
        <View className="flex items-center justify-between mb-3">
          <Text className="text-xl font-bold text-primary">Radar 乐搭</Text>
          <Text className="text-xs text-muted">找搭子 · 组乐队</Text>
        </View>

        {/* ---- Category tabs ---- */}
        <View className="flex bg-gray-100 rounded-lg p-0.5 mb-3">
          {[
            { key: '', label: '全部' },
            { key: 'band', label: '🎸 组乐队' },
            { key: 'show', label: '🎫 看演出' },
          ].map(tab => (
            <View
              key={tab.key}
              className={`flex-1 py-2 rounded-md text-center text-sm font-medium transition
                ${activeCategory === tab.key ? 'bg-white text-primary shadow-sm' : 'text-muted'}`}
              onClick={() => { setActiveCategory(tab.key); setTimeout(() => loadFeed(), 0); }}
            >
              {tab.label}
            </View>
          ))}
        </View>

        {/* Keyword search */}
        <View className="flex gap-2 items-center mb-2">
          <Input
            className="flex-1 bg-gray-100 rounded-lg px-3 py-2 text-sm"
            placeholder="搜索关键词..."
            value={keyword}
            onInput={e => setKeyword(e.detail.value)}
            onConfirm={applyFilters}
          />
          <View
            className={`px-3 py-2 rounded-lg text-sm font-medium ${
              showTagPicker ? 'bg-primary text-white' : 'bg-gray-100 text-muted'
            }`}
            onClick={() => setShowTagPicker(!showTagPicker)}
          >
            标签
          </View>
        </View>

        {/* Quick city chips */}
        <ScrollView scrollX className="flex-row whitespace-nowrap" style={{ height: 32 }}>
          <View className="flex gap-1.5">
            <View
              className={`px-3 py-1 rounded-full text-xs ${
                !filterCity ? 'bg-primary text-white' : 'bg-gray-100 text-muted'
              }`}
              onClick={() => { setFilterCity(''); loadFeed(); }}
            >
              全部
            </View>
            {CITY_OPTIONS.map(c => (
              <View
                key={c}
                className={`px-3 py-1 rounded-full text-xs ${
                  filterCity === c ? 'bg-primary text-white' : 'bg-gray-100 text-muted'
                }`}
                onClick={() => { setFilterCity(filterCity === c ? '' : c); loadFeed(); }}
              >
                {c}
              </View>
            ))}
          </View>
        </ScrollView>

        {/* Expandable tag picker */}
        {showTagPicker && (
          <View className="mt-2 pt-2 border-t border-gray-100">
            <Text className="text-xs text-muted mb-1 block">乐器/角色</Text>
            <View className="flex flex-wrap gap-1 mb-2">
              {INSTRUMENT_TAGS.map(t => (
                <View
                  key={t}
                  className={`px-2.5 py-1 rounded-full text-xs ${
                    selectedTags.includes(t)
                      ? 'bg-primary text-white'
                      : 'bg-gray-100 text-muted'
                  }`}
                  onClick={() => toggleTag(t)}
                >
                  {t}
                </View>
              ))}
            </View>
            <Text className="text-xs text-muted mb-1 block">风格</Text>
            <View className="flex flex-wrap gap-1">
              {GENRE_TAGS.map(t => (
                <View
                  key={t}
                  className={`px-2.5 py-1 rounded-full text-xs ${
                    selectedTags.includes(t)
                      ? 'bg-secondary text-white'
                      : 'bg-gray-100 text-muted'
                  }`}
                  onClick={() => toggleTag(t)}
                >
                  {t}
                </View>
              ))}
            </View>
            <View className="flex gap-2 mt-2">
              <View className="flex-1 py-2 bg-primary rounded-lg text-center text-white text-sm"
                onClick={applyFilters}>
                应用筛选
              </View>
              <View className="px-4 py-2 bg-gray-100 rounded-lg text-center text-muted text-sm"
                onClick={() => setShowTagPicker(false)}>
                取消
              </View>
            </View>
          </View>
        )}

        {/* Active filters indicator */}
        {hasActiveFilters && (
          <View className="mt-2 flex items-center gap-2">
            <Text className="text-xs text-muted">
              {filterCity && `📍 ${filterCity}`}
              {filterCity && selectedTags.length > 0 && ' · '}
              {selectedTags.length > 0 && `🏷 ${selectedTags.length}个标签`}
            </Text>
            <Text className="text-xs text-primary underline" onClick={clearFilters}>
              清除
            </Text>
          </View>
        )}
      </View>

      {/* ---- Main feed ---- */}
      <ScrollView
        scrollY
        className="flex-1"
        onScrollToLower={loadMore}
        lowerThreshold={120}
        refresherEnabled
        refresherTriggered={refreshing}
        onRefresherRefresh={() => loadFeed(true)}
      >
        {/* Loading skeleton */}
        {loading && posts.length === 0 && (
          <View className="px-4 py-10 space-y-4">
            {[1, 2, 3].map(i => (
              <View key={i} className="bg-white rounded-xl p-4 animate-pulse">
                <View className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                <View className="h-3 bg-gray-100 rounded w-1/2 mb-3" />
                <View className="h-3 bg-gray-100 rounded w-full" />
              </View>
            ))}
          </View>
        )}

        {/* Empty state */}
        {!loading && posts.length === 0 && (
          <View className="flex flex-col items-center justify-center py-20 px-4">
            <Text className="text-5xl mb-4">🎵</Text>
            <Text className="text-lg font-semibold text-dark mb-1">
              还没有帖子
            </Text>
            <Text className="text-sm text-muted text-center">
              {hasActiveFilters
                ? '没有找到匹配的帖子，试试调整筛选条件'
                : '成为第一个发布帖子的人吧！'}
            </Text>
          </View>
        )}

        {/* Post cards */}
        {posts.map((post, idx) => (
          <View
            key={post.id}
            className="bg-white mx-3 my-2 rounded-xl shadow-sm p-4 border border-gray-50"
            onClick={() => Taro.navigateTo({ url: `/pages/post-detail/index?id=${post.id}` })}
          >
            {/* Author row */}
            <View className="flex items-center mb-3">
              <View className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center mr-2">
                <Text className="text-xs text-primary font-bold">
                  {(post.user?.full_name || post.user?.email || '?')[0].toUpperCase()}
                </Text>
              </View>
              <View className="flex-1">
                <Text className="text-sm font-medium text-dark">
                  {post.user?.full_name || '匿名用户'}
                </Text>
                <View className="flex items-center gap-2">
                  {post.city && (
                    <Text className="text-xs text-muted">📍 {post.city}</Text>
                  )}
                  <Text className="text-xs text-muted">{formatTime(post.created_at)}</Text>
                </View>
              </View>
            </View>

            {/* Content */}
            <Text className="text-sm text-dark leading-relaxed mb-2 block">
              {post.content}
            </Text>

            {/* Tags */}
            {post.tags && post.tags.length > 0 && (
              <View className="mb-3">
                {post.tags.map(tag => (
                  <TagChip key={tag} tag={tag} />
                ))}
              </View>
            )}

            {/* Images (placeholder) */}
            {post.images && post.images.length > 0 && (
              <ScrollView scrollX className="flex-row mb-3" style={{ height: 96 }}>
                <View className="flex gap-2">
                  {post.images.map((url, i) => (
                    <Image
                      key={i}
                      src={url}
                      className="w-24 h-24 rounded-lg bg-gray-100"
                      mode="aspectFill"
                    />
                  ))}
                </View>
              </ScrollView>
            )}

            {/* Action bar */}
            <View className="flex items-center gap-4 pt-2 border-t border-gray-50">
              {/* Like */}
              <View
                className="flex items-center gap-1"
                onClick={() => handleLike(post.id, idx)}
              >
                <Text className={post.is_liked_by_me ? 'text-red-500' : 'text-muted'}>
                  {post.is_liked_by_me ? '❤️' : '🤍'}
                </Text>
                <Text className={`text-xs ${post.is_liked_by_me ? 'text-red-500' : 'text-muted'}`}>
                  {post.like_count}
                </Text>
              </View>

              {/* Comment (display only for now) */}
              <View className="flex items-center gap-1">
                <Text className="text-muted">💬</Text>
                <Text className="text-xs text-muted">{post.comment_count}</Text>
              </View>

              {/* View count */}
              <View className="flex items-center gap-1 ml-auto">
                <Text className="text-xs text-muted">
                  👁 {post.view_count}
                </Text>
              </View>
            </View>
          </View>
        ))}

        {/* Load more indicator */}
        {loadingMore && (
          <View className="py-4 text-center">
            <Text className="text-xs text-muted">加载中...</Text>
          </View>
        )}

        {/* End of feed */}
        {!loadingMore && !nextCursor && posts.length > 0 && (
          <View className="py-6 text-center">
            <Text className="text-xs text-muted">— 已经到底了 —</Text>
          </View>
        )}

        {/* Bottom spacer for safe area */}
        <View className="h-6" />
      </ScrollView>

      {/* ---- Floating action button (create post) ---- */}
      <View
        className="fixed bottom-6 right-4 w-14 h-14 bg-primary rounded-full shadow-lg
                   flex items-center justify-center z-20 active:scale-95 transition-transform"
        onClick={() => {
          if (!getToken()) {
            Taro.showToast({ title: '登录后即可发帖', icon: 'none' });
            return;
          }
          Taro.navigateTo({ url: '/pages/publish/index' });
        }}
      >
        <Text className="text-white text-2xl">+</Text>
      </View>
    </View>
  );
}
