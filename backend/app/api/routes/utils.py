import os
import uuid

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.core.config import settings

router = APIRouter(prefix="/utils", tags=["utils"])

# Allowed image extensions and max file size (5 MB)
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
MAX_UPLOAD_SIZE = 5 * 1024 * 1024

# Upload directory — mounted as static files in main.py
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.get("/health-check/")
async def health_check() -> bool:
    return True


@router.post("/upload/")
async def upload_image(file: UploadFile = File(...)):
    """Upload an image. Returns the public URL.

    Accepted: .jpg, .jpeg, .png, .gif, .webp (max 5 MB).
    """
    # Validate extension
    _, ext = os.path.splitext(file.filename or "unknown.jpg")
    ext = ext.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    # Read and validate size
    contents = await file.read()
    if len(contents) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 5 MB)")

    # Generate safe filename
    safe_name = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(UPLOAD_DIR, safe_name)

    # Write to disk
    with open(file_path, "wb") as f:
        f.write(contents)

    # Return relative URL — frontend prepends API base
    return {"url": f"/uploads/{safe_name}", "filename": safe_name}
