from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import DnsRecord, User
from ..schemas import DnsRecordIn, DnsRecordOut
from ..routers.domains import _owned_domain

router = APIRouter(prefix="/domains/{name}/dns", tags=["dns"])

VALID_TYPES = {"A", "AAAA", "CNAME", "MX", "TXT", "NS", "CAA", "SRV"}


@router.get("", response_model=list[DnsRecordOut])
def list_records(name: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    domain = _owned_domain(name, db, user)
    return db.query(DnsRecord).filter(DnsRecord.domain_id == domain.id).all()


@router.post("", response_model=DnsRecordOut, status_code=201)
def create_record(
    name: str,
    data: DnsRecordIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    domain = _owned_domain(name, db, user)
    if data.record_type in {"MX", "SRV"} and data.priority is None:
        raise HTTPException(status_code=400, detail=f"{data.record_type} vereist een priority")
    record = DnsRecord(domain_id=domain.id, **data.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.put("/{record_id}", response_model=DnsRecordOut)
def update_record(
    name: str,
    record_id: int,
    data: DnsRecordIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    domain = _owned_domain(name, db, user)
    record = (
        db.query(DnsRecord)
        .filter(DnsRecord.id == record_id, DnsRecord.domain_id == domain.id)
        .first()
    )
    if record is None:
        raise HTTPException(status_code=404, detail="DNS-record niet gevonden")
    for field, value in data.model_dump().items():
        setattr(record, field, value)
    db.commit()
    db.refresh(record)
    return record


@router.delete("/{record_id}", status_code=204)
def delete_record(
    name: str,
    record_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    domain = _owned_domain(name, db, user)
    record = (
        db.query(DnsRecord)
        .filter(DnsRecord.id == record_id, DnsRecord.domain_id == domain.id)
        .first()
    )
    if record is None:
        raise HTTPException(status_code=404, detail="DNS-record niet gevonden")
    db.delete(record)
    db.commit()
    return None
