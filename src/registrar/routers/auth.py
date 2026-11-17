from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import User
from ..schemas import TokenOut, UserCreate, UserLogin, UserOut
from ..security import create_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenOut, status_code=201)
def register(data: UserCreate, response: Response, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == data.email.lower()).first():
        raise HTTPException(status_code=409, detail="E-mailadres is al geregistreerd")
    user = User(
        email=data.email.lower(),
        password_hash=hash_password(data.password),
        name=data.name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_token(user.id)
    response.set_cookie(
        "climora_token", token, httponly=True, samesite="lax", max_age=60 * 60 * 24 * 7
    )
    return TokenOut(access_token=token, user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenOut)
def login(data: UserLogin, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email.lower()).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Onjuiste inloggegevens")
    token = create_token(user.id)
    response.set_cookie(
        "climora_token", token, httponly=True, samesite="lax", max_age=60 * 60 * 24 * 7
    )
    return TokenOut(access_token=token, user=UserOut.model_validate(user))


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie("climora_token")
    return {"ok": True}


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user
