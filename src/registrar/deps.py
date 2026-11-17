from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .database import get_db
from .models import User
from .security import decode_token


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    auth = request.headers.get("Authorization", "")
    token = auth.removeprefix("Bearer ").strip() if auth else ""
    if not token:
        token = request.cookies.get("climora_token", "")
    user_id = decode_token(token) if token else None
    if user_id is None:
        raise HTTPException(status_code=401, detail="Niet ingelogd")
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="Niet ingelogd")
    return user
