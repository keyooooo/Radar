/**
 * Radar Posts service — TypeScript types matching the backend Pydantic schemas
 * and API functions for post feed, search, creation, and likes.
 */

import api, { ApiResponse } from './api';

// ---------------------------------------------------------------------------
// TypeScript types — exact mirror of backend Pydantic models
// ---------------------------------------------------------------------------

/** Mirrors backend `UserPublic` schema. */
export interface UserPublic {
  id: string;            // UUID
  email: string;
  is_active: boolean;
  is_superuser: boolean;
  full_name: string | null;
  created_at: string | null;
  city: string | null;
  instruments: string[] | null;
  genres: string[] | null;
}

/** Mirrors backend `PostPublic` schema. */
export interface PostPublic {
  id: string;            // UUID
  user_id: string;       // UUID
  content: string;
  category: string | null;  // "band" | "show" | null
  city: string | null;
  tags: string[] | null;
  images: string[] | null;
  like_count: number;
  comment_count: number;
  view_count: number;
  created_at: string | null;
  user: UserPublic | null;
  /** UI auxiliary: set locally after like-toggle response. */
  is_liked_by_me?: boolean;
}

/** Mirrors backend `PostsFeedResponse` schema. */
export interface PostsFeedResponse {
  data: PostPublic[];
  next_cursor: string | null;
  message: string;
}

/** Params accepted by the POST /posts/ endpoint (mirrors `PostCreate`). */
export interface PostCreatePayload {
  content: string;
  category?: string;  // "band" | "show"
  city?: string;
  tags?: string[];
  images?: string[];
}

/** Query params for the GET /posts/ cursor-paginated feed. */
export interface PostFeedParams {
  cursor?: string | null;
  size?: number;
  category?: string;   // "band" | "show"
  city?: string;
  tags?: string;       // comma-separated: "后摇,鼓手"
  keyword?: string;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/** Fetch the cursor-paginated post feed with optional filters. */
export async function fetchPosts(
  params: PostFeedParams = {},
): Promise<ApiResponse<PostsFeedResponse>> {
  const query = new URLSearchParams();
  query.set('size', String(params.size ?? 10));
  if (params.cursor) query.set('cursor', params.cursor);
  if (params.category) query.set('category', params.category);
  if (params.city) query.set('city', params.city);
  if (params.tags) query.set('tags', params.tags);
  if (params.keyword) query.set('keyword', params.keyword);

  return api.get<PostsFeedResponse>(`/posts/?${query.toString()}`);
}

/** Create a new post (requires auth). */
export async function createPost(
  payload: PostCreatePayload,
): Promise<ApiResponse<PostPublic>> {
  return api.post<PostPublic>('/posts/', payload as unknown as Record<string, unknown>);
}

/** Toggle like on a post (requires auth). Returns { message: string }. */
export async function toggleLike(
  postId: string,
): Promise<ApiResponse<{ message: string }>> {
  return api.post<{ message: string }>(`/posts/${postId}/like`);
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export interface CommentPublic {
  id: string;
  post_id: string;
  user_id: string;
  parent_id: string | null;
  reply_to_user_id: string | null;
  content: string;
  created_at: string | null;
  user: UserPublic | null;
  reply_to_user: UserPublic | null;
}

export interface RootCommentWithReplies {
  root: CommentPublic;
  replies: CommentPublic[];
}

export interface CommentTreeResponse {
  data: RootCommentWithReplies[];
  message: string;
}

export interface CommentCreatePayload {
  post_id: string;
  content: string;
  parent_id?: string | null;
  reply_to_user_id?: string | null;
}

export async function fetchComments(
  postId: string,
): Promise<ApiResponse<CommentTreeResponse>> {
  return api.get<CommentTreeResponse>(`/comments/post/${postId}`);
}

export async function createComment(
  payload: CommentCreatePayload,
): Promise<ApiResponse<CommentPublic>> {
  return api.post<CommentPublic>('/comments/', payload as unknown as Record<string, unknown>);
}
