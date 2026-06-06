/**
 * Radar Post Detail Page — full post + comment tree + reply input.
 * Fetches the single post via GET /posts/{id}.
 */

import { useCallback, useEffect, useState } from 'react';
import { View, Text, Image, ScrollView, Input } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';

import api from '../../services/api';
import {
  fetchComments,
  createComment,
  toggleLike,
  type PostPublic,
  type RootCommentWithReplies,
} from '../../services/posts';
import { getToken } from '../../services/api';

export default function PostDetailPage() {
  const postId = Taro.getCurrentInstance().router?.params.id as string;

  const [post, setPost] = useState<PostPublic | null>(null);
  const [comments, setComments] = useState<RootCommentWithReplies[]>([]);
  const [loading, setLoading] = useState(true);

  // Reply input state
  const [replyTarget, setReplyTarget] = useState<{
    parentId: string;
    userName: string;
    userId: string;
  } | null>(null);
  const [replyText, setReplyText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // --- Load post + comments ---
  const load = useCallback(async () => {
    if (!postId) return;
    setLoading(true);
    try {
      // Fetch single post by ID (new backend endpoint)
      const postRes = await api.get<PostPublic>(`/posts/${postId}`);
      if (postRes.ok) setPost(postRes.data);

      // Fetch comments
      const commentRes = await fetchComments(postId);
      if (commentRes.ok) setComments(commentRes.data.data);
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => { load(); }, [postId]);
  useDidShow(() => { load(); });

  // --- Like toggle ---
  const handleLike = async () => {
    if (!post || !getToken()) {
      Taro.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    const wasLiked = post.is_liked_by_me;
    setPost(prev => prev ? {
      ...prev,
      is_liked_by_me: !wasLiked,
      like_count: wasLiked ? Math.max(0, prev.like_count - 1) : prev.like_count + 1,
    } : null);
    try { await toggleLike(post.id); } catch {
      setPost(prev => prev ? { ...prev, is_liked_by_me: wasLiked, like_count: post.like_count } : null);
    }
  };

  // --- Submit comment ---
  const submitComment = async () => {
    const text = replyText.trim();
    if (!text || !postId || !getToken()) return;
    setSubmitting(true);
    try {
      const res = await createComment({
        post_id: postId,
        content: text,
        parent_id: replyTarget?.parentId || null,
        reply_to_user_id: replyTarget?.userId || null,
      });
      if (res.ok) {
        setReplyText('');
        setReplyTarget(null);
        Taro.showToast({ title: '评论成功', icon: 'success' });
        load();
      }
    } catch { Taro.showToast({ title: '评论失败', icon: 'none' }); }
    finally { setSubmitting(false); }
  };

  // --- Helpers ---
  const formatTime = (iso: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    if (diff < 60_000) return '刚刚';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  const imgUrl = (url: string) =>
    (url || '').startsWith('/') ? `http://127.0.0.1:8000${url}` : url;

  // --- Loading / not-found states ---
  if (loading) {
    return (
      <View className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Text className="text-muted">加载中...</Text>
      </View>
    );
  }
  if (!post) {
    return (
      <View className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Text className="text-muted">帖子不存在</Text>
      </View>
    );
  }

  return (
    <View className="min-h-screen bg-gray-50 flex flex-col pb-16">
      <ScrollView scrollY className="flex-1">
        {/* ===== Post body ===== */}
        <View className="bg-white mx-3 mt-3 rounded-xl p-4 shadow-sm">
          {/* Author row */}
          <View className="flex items-center mb-3">
            <View className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center mr-2">
              <Text className="text-xs text-primary font-bold">
                {(post.user?.full_name || '?')[0].toUpperCase()}
              </Text>
            </View>
            <View>
              <Text className="text-sm font-medium text-dark">{post.user?.full_name || '匿名'}</Text>
              <View className="flex items-center gap-2">
                {post.city && <Text className="text-xs text-muted">📍 {post.city}</Text>}
                <Text className="text-xs text-muted">{formatTime(post.created_at)}</Text>
              </View>
            </View>
            {post.category && (
              <View className="ml-auto px-2.5 py-0.5 rounded-full bg-indigo-50">
                <Text className="text-xs text-primary">
                  {post.category === 'band' ? '🎸 组乐队' : '🎫 看演出'}
                </Text>
              </View>
            )}
          </View>

          {/* Content */}
          <Text className="text-sm text-dark leading-relaxed block mb-3">{post.content}</Text>

          {/* Images */}
          {post.images && post.images.filter(Boolean).length > 0 && (
            <View className="flex flex-wrap gap-1 mb-3">
              {post.images.filter(Boolean).map((url, i) => (
                <Image key={i} src={imgUrl(url)}
                  className="w-[calc(33%-2px)] aspect-square rounded-lg bg-gray-100" mode="aspectFill" />
              ))}
            </View>
          )}

          {/* Tags */}
          {post.tags && post.tags.length > 0 && (
            <View className="flex flex-wrap gap-1 mb-3">
              {post.tags.map(t => (
                <Text key={t} className="text-xs bg-indigo-50 text-primary px-2 py-0.5 rounded-full">{t}</Text>
              ))}
            </View>
          )}

          {/* Action bar */}
          <View className="flex items-center gap-5 pt-2 border-t border-gray-50">
            <View className="flex items-center gap-1" onClick={handleLike}>
              <Text>{post.is_liked_by_me ? '❤️' : '🤍'}</Text>
              <Text className="text-xs text-muted">{post.like_count}</Text>
            </View>
            <View className="flex items-center gap-1">
              <Text>💬</Text>
              <Text className="text-xs text-muted">{post.comment_count}</Text>
            </View>
          </View>
        </View>

        {/* ===== Comments ===== */}
        <View className="bg-white mx-3 mt-3 rounded-xl p-4 shadow-sm mb-6">
          <Text className="text-sm font-semibold text-dark mb-3 block">
            评论 ({comments.reduce((s, r) => s + 1 + r.replies.length, 0)})
          </Text>

          {comments.length === 0 && (
            <Text className="text-sm text-muted text-center py-6 block">暂无评论，来说两句吧</Text>
          )}

          {comments.map(root => (
            <View key={root.root.id} className="mb-3 pb-3 border-b border-gray-50 last:border-0">
              {/* === Root comment === */}
              <View className="flex gap-2">
                <View className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                  <Text className="text-xs text-primary font-bold">
                    {(root.root.user?.full_name || '?')[0].toUpperCase()}
                  </Text>
                </View>
                <View className="flex-1">
                  <View className="flex items-center gap-2 mb-0.5">
                    <Text className="text-xs font-medium text-dark">{root.root.user?.full_name || '匿名'}</Text>
                    <Text className="text-xs text-muted">{formatTime(root.root.created_at)}</Text>
                  </View>
                  <Text className="text-sm text-dark leading-relaxed block mb-1">{root.root.content}</Text>
                  <Text className="text-xs text-primary"
                    onClick={() => setReplyTarget({
                      parentId: root.root.id,
                      userName: root.root.user?.full_name || '匿名',
                      userId: root.root.user_id,
                    })}>
                    回复
                  </Text>
                </View>
              </View>

              {/* === Replies === */}
              {root.replies.map(reply => (
                <View key={reply.id} className="flex gap-2 ml-9 mt-2 pt-2 border-t border-gray-30">
                  <View className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                    <Text className="text-xs text-muted font-bold">
                      {(reply.user?.full_name || '?')[0].toUpperCase()}
                    </Text>
                  </View>
                  <View className="flex-1">
                    <View className="flex items-center gap-2 mb-0.5">
                      <Text className="text-xs font-medium text-dark">{reply.user?.full_name || '匿名'}</Text>
                      {reply.reply_to_user && (
                        <Text className="text-xs text-muted">回复 {reply.reply_to_user.full_name}</Text>
                      )}
                      <Text className="text-xs text-muted">{formatTime(reply.created_at)}</Text>
                    </View>
                    <Text className="text-sm text-dark leading-relaxed block">{reply.content}</Text>
                  </View>
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>

      {/* ===== Reply input bar ===== */}
      <View className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-3 py-2 flex items-center gap-2 z-20">
        {replyTarget && (
          <View className="absolute -top-7 left-3 bg-gray-800 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
            <Text>回复 @{replyTarget.userName}</Text>
            <Text className="text-gray-400 ml-1" onClick={() => setReplyTarget(null)}>✕</Text>
          </View>
        )}
        <Input className="flex-1 bg-gray-100 rounded-full px-4 py-2 text-sm"
          placeholder={replyTarget ? `回复 @${replyTarget.userName}...` : '说点什么...'}
          value={replyText}
          onInput={e => setReplyText(e.detail.value)}
          onConfirm={submitComment}
        />
        <View className={`px-4 py-2 rounded-full text-sm font-medium text-white ${submitting || !replyText.trim() ? 'bg-gray-300' : 'bg-primary'}`}
          onClick={submitting ? undefined : submitComment}>
          发送
        </View>
      </View>
    </View>
  );
}
