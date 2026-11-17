from __future__ import annotations

import datetime as dt
import re

import idna
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Domain, User
from ..schemas import (
    DomainDetail,
    DomainFlagsIn,
    DomainOut,
    NameserversIn,
    SearchHit,
    SearchResponse,
)
from ..services.registry import DomainUnavailable, registry
from ..tlds import ALL_TLDS, RESTRICTION_LABELS, Restriction, get_tld, split_domain

router = APIRouter(prefix="/domains", tags=["domains"])

LABEL_RE = re.compile(r"^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$")


def normalize_query(name: str) -> tuple[str, str]:
    name = name.strip().lower().strip(".")
    if not name:
        raise HTTPException(status_code=400, detail="Vul een domeinnaam in")
    parts = split_domain(name)
    if parts:
        label, tld = parts
        if get_tld(tld) is None:
            raise HTTPException(status_code=400, detail=f"TLD .{tld} wordt niet ondersteund")
    else:
        label, tld = name, ""
    try:
        label = label.encode("idna").decode("ascii").lower()
    except idna.IDNAError as exc:
        raise HTTPException(status_code=400, detail=f"Ongeldige domeinnaam: {exc}") from exc
    if not LABEL_RE.match(label):
        raise HTTPException(
            status_code=400,
            detail="Domeinnaam mag alleen letters, cijfers en streepjes bevatten (geen streepje aan begin/eind)",
        )
    return label, tld


@router.get("/search", response_model=SearchResponse)
def search(
    q: str = Query(min_length=1, max_length=253),
    limit: int = Query(default=24, ge=1, le=100),
    db: Session = Depends(get_db),
):
    label, tld = normalize_query(q)
    candidates = [get_tld(tld)] if tld else ALL_TLDS
    results = []
    for info in candidates:
        if info is None:
            continue
        domain = f"{label}.{info.tld}"
        available = registry.is_available(db, domain)
        results.append(
            SearchHit(
                domain=domain,
                tld=info.tld,
                available=available,
                price=info.price,
                restriction=info.restriction,
                restriction_label=RESTRICTION_LABELS[info.restriction],
            )
        )
        if len(results) >= limit:
            break
    results.sort(key=lambda r: (not r.available, r.tld))
    return SearchResponse(query=label, results=results)


@router.post("/register/{name}", response_model=DomainDetail, status_code=201)
def register_domain(
    name: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    label, tld = normalize_query(name)
    if not tld:
        raise HTTPException(
            status_code=400, detail="Geef een volledige domeinnaam op, bijv. mijnsite.nl"
        )
    info = get_tld(tld)
    if info is None:
        raise HTTPException(status_code=400, detail=f"TLD .{tld} wordt niet ondersteund")
    if info.restriction != Restriction.NONE:
        raise HTTPException(
            status_code=403,
            detail=f".{tld}: {RESTRICTION_LABELS[info.restriction]} — verificatie vereist",
        )
    full = f"{label}.{tld}"
    try:
        domain = registry.register(db, full, user.id)
    except DomainUnavailable:
        raise HTTPException(status_code=409, detail=f"{full} is niet beschikbaar") from None
    return DomainDetail(**DomainOut.model_validate(domain).model_dump(), dns_records=[])


@router.get("/mine", response_model=list[DomainOut])
def my_domains(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.query(Domain).filter(Domain.owner_id == user.id).order_by(Domain.name).all()


def _owned_domain(name: str, db: Session, user: User) -> Domain:
    label, tld = normalize_query(name)
    full = f"{label}.{tld}" if tld else label
    domain = db.query(Domain).filter(Domain.name == full, Domain.owner_id == user.id).first()
    if domain is None:
        raise HTTPException(status_code=404, detail="Domein niet gevonden in jouw account")
    return domain


@router.get("/{name}", response_model=DomainDetail)
def domain_detail(
    name: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    domain = _owned_domain(name, db, user)
    return DomainDetail(
        **DomainOut.model_validate(domain).model_dump(), dns_records=list(domain.dns_records)
    )


@router.put("/{name}/nameservers", response_model=DomainOut)
def set_nameservers(
    name: str,
    data: NameserversIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    domain = _owned_domain(name, db, user)
    cleaned = []
    for ns in data.nameservers:
        ns = ns.strip().lower().strip(".")
        try:
            ns.encode("idna")
        except idna.IDNAError as exc:
            raise HTTPException(status_code=400, detail=f"Ongeldige nameserver: {ns}") from exc
        if ns:
            cleaned.append(ns)
    if not cleaned:
        raise HTTPException(status_code=400, detail="Minimaal één nameserver vereist")
    domain.nameservers = "\n".join(cleaned)
    db.commit()
    db.refresh(domain)
    return domain


@router.patch("/{name}", response_model=DomainOut)
def update_flags(
    name: str,
    data: DomainFlagsIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    domain = _owned_domain(name, db, user)
    if data.auto_renew is not None:
        domain.auto_renew = data.auto_renew
    if data.whois_privacy is not None:
        domain.whois_privacy = data.whois_privacy
    db.commit()
    db.refresh(domain)
    return domain


@router.post("/{name}/renew", response_model=DomainOut)
def renew(name: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    domain = _owned_domain(name, db, user)
    now = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
    base = max(domain.expires_at, now)
    domain.expires_at = base + dt.timedelta(days=365)
    db.commit()
    db.refresh(domain)
    return domain


@router.delete("/{name}", status_code=204)
def release(name: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    domain = _owned_domain(name, db, user)
    registry.release(db, domain.name)
    return None
