"""
Radar (乐搭) — mock data seeder.

Creates a test user, generates a long-lived JWT token, and inserts
5 realistic music-related treehole posts for frontend preview.

Usage:
    cd backend && python seed_mock_data.py
"""

import uuid
from datetime import datetime, timedelta, timezone

from sqlmodel import Session, select

from app.core.config import settings
from app.core.db import engine
from app.core.security import create_access_token, get_password_hash
from app.models import Post, User

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

TEST_USER = {
    "email": "testuser@radar.com",
    "password": "password123",
    "full_name": "小乐",
    "city": "北京",
    "instruments": ["吉他", "主唱"],
    "genres": ["后摇", "英伦摇滚"],
}

MOCK_POSTS = [
    {
        "content": (
            "北京后摇乐队招募鼓手，排练室在五道口，"
            "目前已有吉他和贝斯，风格偏向 Wang Wen / Explosions in the Sky。"
        ),
        "city": "北京",
        "tags": ["后摇", "鼓手"],
    },
    {
        "content": (
            "上海有没有今晚一起去 MAO Livehouse 看演出的小伙伴？"
            "求捡，票已买！"
        ),
        "city": "上海",
        "tags": ["看演出", "独立摇滚"],
    },
    {
        "content": (
            "广州求个重金属主唱，要求能开水喉，技术在线。"
            "我们是一群老炮儿了。"
        ),
        "city": "广州",
        "tags": ["金属", "主唱"],
    },
    {
        "content": (
            "成都新开的排练室音响太顶了，"
            "有人周末来合流玩几首痛仰或者新裤子吗？"
        ),
        "city": "成都",
        "tags": ["新裤子", "吉他"],
    },
    {
        "content": (
            "深夜树洞：有没有人推荐一些好听的数学摇滚（Math Rock）乐团？"
            "最近耳朵有点挑剔。"
        ),
        "city": None,
        "tags": ["数学摇滚"],
    },
]

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    with Session(engine) as session:
        # --- 1. Create or find test user ---
        user = session.exec(
            select(User).where(User.email == TEST_USER["email"])
        ).first()

        if not user:
            user = User(
                id=uuid.uuid4(),
                email=TEST_USER["email"],
                hashed_password=get_password_hash(TEST_USER["password"]),
                full_name=TEST_USER["full_name"],
                is_active=True,
                is_superuser=False,
                city=TEST_USER["city"],
                instruments=TEST_USER["instruments"],
                genres=TEST_USER["genres"],
            )
            session.add(user)
            session.commit()
            session.refresh(user)
            print(f"[✓] Created test user: {user.email} (id={user.id})")
        else:
            print(f"[✓] Test user already exists: {user.email} (id={user.id})")

        # --- 2. Generate long-lived JWT (365 days) ---
        token = create_access_token(
            subject=user.id, expires_delta=timedelta(days=365)
        )
        print()
        print("=" * 64)
        print("  🔑  JWT ACCESS TOKEN (valid 365 days)")
        print("=" * 64)
        print(token)
        print("=" * 64)
        print()
        print("  Copy the line above and run this in your browser console:")
        print()
        print('    localStorage.setItem("radar_token", "<PASTE_TOKEN_HERE>");')
        print()
        print(f'    Or for WeChat DevTools: wx.setStorageSync("radar_token", "<PASTE_TOKEN_HERE>");')
        print("=" * 64)
        print()

        # --- 3. Insert mock posts (skip if user already has posts) ---
        existing_posts = session.exec(
            select(Post).where(Post.user_id == user.id)
        ).all()

        if existing_posts:
            print(f"[i] User already has {len(existing_posts)} posts — skipping mock inserts")
            print()
            # Still show existing posts for reference
            for p in existing_posts:
                print(f"    [{p.created_at}] {p.content[:60]}...")
            return user, token

        now = datetime.now(timezone.utc)
        for i, data in enumerate(MOCK_POSTS):
            # Stagger created_at so cursor pagination is testable
            created = now - timedelta(hours=len(MOCK_POSTS) - i, minutes=i * 10)
            post = Post(
                id=uuid.uuid4(),
                user_id=user.id,
                content=data["content"],
                city=data["city"],
                tags=data["tags"],
                images=[],
                like_count=i * 3,          # varied for visual testing
                comment_count=i * 2 + 1,   # varied
                view_count=(i + 1) * 15,
                created_at=created,
            )
            session.add(post)
            print(f"[✓] Created post {i+1}: {data['content'][:50]}...")

        session.commit()
        print()
        print(f"[✓] Inserted {len(MOCK_POSTS)} mock posts successfully!")
        print()

    return user, token


if __name__ == "__main__":
    user, token = main()

    # --- 4. Summary ---
    print("=" * 64)
    print("  📋  SUMMARY")
    print("=" * 64)
    print(f"  User:       {TEST_USER['email']}")
    print(f"  Password:   {TEST_USER['password']}")
    print(f"  City:       {TEST_USER['city']}")
    print(f"  Instruments: {', '.join(TEST_USER['instruments'])}")
    print(f"  Genres:     {', '.join(TEST_USER['genres'])}")
    print(f"  Posts:      {len(MOCK_POSTS)}")
    print()
    print("  Backend API:  http://localhost:8000/api/v1")
    print("  API Docs:     http://localhost:8000/docs")
    print("  Health:       http://localhost:8000/api/v1/utils/health-check/")
    print("=" * 64)
